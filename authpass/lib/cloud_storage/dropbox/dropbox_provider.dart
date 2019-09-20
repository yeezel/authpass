import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:authpass/bloc/kdbx_bloc.dart';
import 'package:authpass/cloud_storage/cloud_storage_provider.dart';
import 'package:authpass/cloud_storage/dropbox/dropbox_models.dart';
import 'package:authpass/env/_base.dart';
import 'package:flutter/widgets.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:logging/logging.dart';
import 'package:meta/meta.dart';
import 'package:oauth2/oauth2.dart' as oauth2;

final _logger = Logger('authpass.dropbox_provider');

const _METADATA_KEY_DROPBOX_DATA = 'dropbox.file_metadata';

/// header name used by dropbox to return metadata during file download.
const _HEADER_DOWNLOAD_METADATA = 'Dropbox-API-Result';

class DropboxProvider extends CloudStorageProviderClientBase<oauth2.Client> {
  DropboxProvider({@required this.env, @required CloudStorageHelper helper}) : super(helper: helper);

  static const String _oauthEndpoint = 'https://www.dropbox.com/oauth2/authorize';
  static const String _oauthToken = 'https://api.dropboxapi.com/oauth2/token';

  Env env;

//  Future<oauth2.Client> _requireAuthenticatedClient() async {
//    return _client ??= await _loadStoredCredentials().then((client) async {
//      if (client == null) {
//        throw LoadFileException('Unable to load dropbox credentials.');
//      }
//      return client;
//    });
//  }
//
//  Future<oauth2.Client> _loadStoredCredentials() async {
//    final credentialsJson = await loadCredentials();
//    _logger.finer('Tried to load auth. ${credentialsJson == null ? 'not found' : 'found'}');
//    if (credentialsJson == null) {
//      return null;
//    }
//    final credentials = oauth2.Credentials.fromJson(credentialsJson);
//    return oauth2.Client(
//      credentials,
//      identifier: env.secrets.dropboxKey,
//      secret: env.secrets.dropboxSecret,
//      onCredentialsRefreshed: _onCredentialsRefreshed,
//    );
//  }
//
//  @override
//  Future<bool> loadSavedAuth() async {
//    _client = await _loadStoredCredentials();
//    return isAuthenticated;
//  }

  @override
  oauth2.Client clientWithStoredCredentials(String stored) {
    final credentials = oauth2.Credentials.fromJson(stored);
    return oauth2.Client(
      credentials,
      identifier: env.secrets.dropboxKey,
      secret: env.secrets.dropboxSecret,
      onCredentialsRefreshed: _onCredentialsRefreshed,
    );
  }

  @override
  Future<oauth2.Client> clientFromAuthenticationFlow(prompt) async {
    final grant = oauth2.AuthorizationCodeGrant(
      env.secrets.dropboxKey,
      Uri.parse(_oauthEndpoint),
      Uri.parse(_oauthToken),
      secret: env.secrets.dropboxSecret,
      onCredentialsRefreshed: _onCredentialsRefreshed,
    );
    final authUrl = grant.getAuthorizationUrl(null);
    final params = Map<String, String>.from(authUrl.queryParameters); //..remove('redirect_uri');
    final url = authUrl.replace(queryParameters: params);
    final code = await prompt(url.toString());
    if (code == null) {
      _logger.warning('User cancelled authorization. (did not provide code)');
      return null;
    }
    final client = await grant.handleAuthorizationCode(code);
    _onCredentialsRefreshed(client.credentials);
    return client;
  }

  void _onCredentialsRefreshed(oauth2.Credentials credentials) {
    _logger.fine('Received new credentials from oauth.');
    storeCredentials(credentials.toJson());
  }

  @override
  Future<SearchResponse> search({String name = 'kdbx'}) async {
    final searchUri = Uri.parse('https://api.dropboxapi.com/2/files/search_v2');
    final client = await requireAuthenticatedClient();
    final response = await client.post(
      searchUri,
      headers: {
        HttpHeaders.contentTypeHeader: ContentType.json.toString(),
      },
      body: json.encode(<String, String>{'query': name}),
    );
    if (response.statusCode >= 300 || response.statusCode < 200) {
      _logger.severe('Error during call to dropbox endpoint. '
          '${response.statusCode} ${response.reasonPhrase} ($response)');
      throw Exception('Error during request. (${response.statusCode} ${response.reasonPhrase})');
    }
    final jsonData = json.decode(response.body) as Map<String, dynamic>;
    _logger.finest('response: $jsonData');
    final jsonResponse = FileSearchResponse.fromJson(jsonData);
    _logger.finest('Got response: $jsonResponse');
    return SearchResponse(
      (srb) => srb
        ..results.addAll(
          jsonResponse.matches.map((responseEntity) {
            final metadata = responseEntity.metadata.metadata;
            return CloudStorageEntity(
              (b) => b
                ..name = metadata.name
                ..id = metadata.id
                ..type = CloudStorageEntityType.file
                ..path = metadata.pathDisplay,
            );
          }),
        )
        ..hasMore = jsonResponse.hasMore,
    );
  }

  @override
  String get displayName => 'Dropbox';

  @override
  IconData get displayIcon => FontAwesomeIcons.dropbox;

  @override
  Future<FileContent> loadEntity(CloudStorageEntity file) async {
    final client = await requireAuthenticatedClient();
    final downloadUrl = Uri.parse('https://content.dropboxapi.com/2/files/download');
    final apiArg = json.encode(<String, String>{'path': '${file.id}'});
    _logger.finer('Downloading file with id ${file.id}');
    final response = await client.post(downloadUrl, headers: {'Dropbox-API-Arg': apiArg});
    _logger.finer(
        'downloaded file. status:${response.statusCode} byte length: ${response.bodyBytes.lengthInBytes} --- headers: ${response.headers}');
    if (response.statusCode ~/ 100 != 2) {
      _logger.warning('Got error code ${response.statusCode}');
      final contentType = ContentType.parse(response.headers[HttpHeaders.contentTypeHeader]);
      if (contentType.subType == ContentType.json.subType) {
        final jsonBody = json.decode(response.body) as Map<String, dynamic>;
        if (jsonBody['error_summary'] != null) {
          throw LoadFileException(jsonBody['error_summary'].toString());
        }
        _logger.severe('got a json response?! ${response.body}');
        _logger.info('Got content type: $contentType');
      }
    }
    // we store the whole metadata, but just make sure it is a correct json.
    _logger.info('headers: ${response.headers}');
    final apiResultJson = response.headers[_HEADER_DOWNLOAD_METADATA.toLowerCase()];
    if (apiResultJson == null) {
      throw StateError('Invalid respose from dropbox. missing header $_HEADER_DOWNLOAD_METADATA');
    }
    final fileMetadataJson = json.decode(apiResultJson) as Map<String, dynamic>;
    final metadata = FileMetadata.fromJson(fileMetadataJson);
    _logger.fine('Loaded rev ${metadata.rev}');
    return FileContent(response.bodyBytes, <String, dynamic>{_METADATA_KEY_DROPBOX_DATA: fileMetadataJson});
  }

  @override
  Future<Map<String, dynamic>> saveEntity(
      CloudStorageEntity file, Uint8List bytes, Map<String, dynamic> previousMetadata) async {
    dynamic mode = 'overwrite';
    if (previousMetadata != null && previousMetadata[_METADATA_KEY_DROPBOX_DATA] != null) {
      final fileMetadata = FileMetadata.fromJson(previousMetadata[_METADATA_KEY_DROPBOX_DATA] as Map<String, dynamic>);
      mode = <String, dynamic>{
        '.tag': 'update',
        'update': fileMetadata.rev,
      };
      _logger.fine('Updating rev ${fileMetadata.rev}');
    }
    final uploadUrl = Uri.parse('https://content.dropboxapi.com/2/files/upload');
    final apiArg = json.encode(<String, dynamic>{
      'path': file.id,
      'mode': mode,
      'autorename': false,
    });
    _logger.fine('sending apiArg: $apiArg');
    final client = await requireAuthenticatedClient();
    final response = await client.post(uploadUrl,
        headers: {
          HttpHeaders.contentTypeHeader: ContentType.binary.toString(),
          'Dropbox-API-Arg': apiArg,
        },
        body: bytes);
    _logger.fine('Got rersponse ${response.statusCode}: ${response.body}');
    if (response.statusCode ~/ 100 != 2) {
      final info = json.decode(response.body) as Map<String, dynamic>;
      if (response.statusCode == HttpStatus.conflict) {
        final dynamic error = info['error'];
        if (error is Map<String, dynamic>) {
          if (error['conflict'] != null) {
            throw StorageException(StorageExceptionType.conflict, info['error_summary'].toString());
          }
        }
      }
      throw StorageException(StorageExceptionType.unknown, info['error_summary'].toString() ?? info.toString());
    }
    final metadataJson = json.decode(response.body) as Map<String, dynamic>;
    final metadata = FileMetadata.fromJson(metadataJson);
    _logger.fine('new rev: ${metadata.rev}');
    return metadataJson;
  }
}
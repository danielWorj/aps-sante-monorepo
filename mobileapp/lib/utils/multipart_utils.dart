// lib/utils/multipart_utils.dart
//
// `http.MultipartFile.fromBytes` envoie `application/octet-stream` quand
// aucun `contentType` n'est fourni. Or le serveur (multer, voir
// server/src/middlewares/upload.middleware.js) filtre les fichiers sur
// `file.mimetype` et rejette tout ce qui n'est pas JPEG/PNG/WEBP/PDF avec
// un 400 « Type de fichier non autorisé ». Ce helper déduit donc le type
// MIME de l'extension du nom de fichier.

import 'package:http_parser/http_parser.dart';

/// Type MIME correspondant à l'extension de [nomFichier]. Retombe sur
/// `application/octet-stream` pour une extension inconnue (le serveur
/// refusera alors le fichier avec un message explicite).
MediaType mediaTypeDepuisNom(String nomFichier) {
  final point = nomFichier.lastIndexOf('.');
  final extension =
  point == -1 ? '' : nomFichier.substring(point + 1).toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return MediaType('image', 'jpeg');
    case 'png':
      return MediaType('image', 'png');
    case 'webp':
      return MediaType('image', 'webp');
    case 'pdf':
      return MediaType('application', 'pdf');
    default:
      return MediaType('application', 'octet-stream');
  }
}

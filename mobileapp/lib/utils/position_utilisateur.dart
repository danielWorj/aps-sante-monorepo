import 'package:geolocator/geolocator.dart';

/// Position refusée ou indisponible : [message] est affichable tel quel.
class PositionIndisponible implements Exception {
  const PositionIndisponible(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Position actuelle de l'utilisateur (filtres « Autour de moi »).
/// Demande la permission au besoin ; lève [PositionIndisponible] si le
/// service est coupé, la permission refusée ou la position introuvable.
Future<({double latitude, double longitude})> obtenirPositionUtilisateur() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw const PositionIndisponible('Activez la localisation de votre téléphone.');
  }
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied) {
    throw const PositionIndisponible('Accès à votre position refusé.');
  }
  if (permission == LocationPermission.deniedForever) {
    throw const PositionIndisponible(
        'Accès à votre position bloqué : autorisez-le dans les réglages du téléphone.');
  }
  try {
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.medium,
        timeLimit: Duration(seconds: 15),
      ),
    );
    return (latitude: p.latitude, longitude: p.longitude);
  } catch (_) {
    throw const PositionIndisponible('Position introuvable, réessayez.');
  }
}

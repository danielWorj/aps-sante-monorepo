// lib/models/visio_models.dart
class VisioSession {
  final String token;
  final String roomName;
  final String domain;

  const VisioSession({
    required this.token,
    required this.roomName,
    required this.domain,
  });

  factory VisioSession.fromJson(Map<String, dynamic> json) => VisioSession(
    token: json['token'] as String,
    roomName: json['roomName'] as String,
    domain: json['domain'] as String,
  );
}
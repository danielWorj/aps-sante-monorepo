// Aperçu visuel temporaire de la refonte (non versionné).
// flutter test test/_apercu --update-goldens
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/components/style/app_theme.dart';

import 'ecrans.dart';

Future<void> _chargerPolices() async {
  Future<void> famille(String nom, List<String> fichiers) async {
    final l = FontLoader(nom);
    for (final f in fichiers) {
      l.addFont(File(f).readAsBytes().then((b) => ByteData.view(b.buffer)));
    }
    await l.load();
  }

  await famille('PlusJakartaSans', [
    'assets/fonts/PlusJakartaSans-Regular.ttf',
    'assets/fonts/PlusJakartaSans-Medium.ttf',
    'assets/fonts/PlusJakartaSans-SemiBold.ttf',
    'assets/fonts/PlusJakartaSans-Bold.ttf',
    'assets/fonts/PlusJakartaSans-ExtraBold.ttf',
  ]);
  await famille('DMMono', ['assets/fonts/DMMono-Medium.ttf']);
  await famille('InstrumentSerif', ['assets/fonts/InstrumentSerif-Italic.ttf']);
  final mi = File(
      '${Platform.environment['FLUTTER_ROOT'] ?? 'C:/flutter/flutter'}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
  if (mi.existsSync()) {
    await famille('MaterialIcons', [mi.path]);
  }
}

void main() {
  setUpAll(_chargerPolices);

  for (final e in ecrans.entries) {
    testWidgets(e.key, (tester) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          home: e.value(),
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('png/${e.key}.png'));
    });
  }
}

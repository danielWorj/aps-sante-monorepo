import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'colors.dart';
import 'text_styles.dart';

/// Thème Material global — refonte 2026 (`new-mobile-ui.html`).
///
/// Tous les widgets Material (champs, boutons, feuilles, dialogues,
/// onglets, bascules…) héritent ici de la nouvelle direction visuelle :
/// surfaces claires, rayons 12 · 16 · 22 · 32, Plus Jakarta Sans en gras,
/// un seul vert d'action.
class AppTheme {
  AppTheme._();

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.b7,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.b7,
      onPrimary: Colors.white,
      primaryContainer: AppColors.b1,
      onPrimaryContainer: AppColors.b8,
      secondary: AppColors.ink,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.b1,
      onSecondaryContainer: AppColors.b7,
      tertiary: AppColors.violet,
      error: AppColors.red,
      onError: Colors.white,
      errorContainer: AppColors.red100,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      onSurfaceVariant: AppColors.ink2,
      surfaceContainerLowest: AppColors.surface,
      surfaceContainerLow: AppColors.surface,
      surfaceContainer: AppColors.surface,
      surfaceContainerHigh: AppColors.surface,
      surfaceContainerHighest: AppColors.segment,
      surfaceTint: Colors.transparent,
      outline: AppColors.lineStrong,
      outlineVariant: AppColors.line,
    );

    const radius16 = BorderRadius.all(Radius.circular(16));
    const radius18 = BorderRadius.all(Radius.circular(18));

    OutlineInputBorder border(Color c, [double w = 1.5]) => OutlineInputBorder(
          borderRadius: radius16,
          borderSide: BorderSide(color: c, width: w),
        );

    const labelBtn = TextStyle(
      fontFamily: AppTextStyles.fontSans,
      fontSize: 15,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.15,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: AppTextStyles.fontSans,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bg,
      canvasColor: AppColors.bg,
      splashFactory: InkSparkle.splashFactory,
      dividerColor: AppColors.line,
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
        fontFamily: AppTextStyles.fontSans,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 15,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
          color: AppColors.ink,
        ),
        iconTheme: IconThemeData(color: AppColors.ink, size: 22),
      ),
      iconTheme: const IconThemeData(color: AppColors.ink, size: 20),
      actionIconTheme: ActionIconThemeData(
        backButtonIconBuilder: (_) =>
            const Icon(Icons.chevron_left_rounded, size: 28),
        closeButtonIconBuilder: (_) =>
            const Icon(Icons.close_rounded, size: 22),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.line,
        thickness: 1,
        space: 1,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        isDense: false,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        border: border(AppColors.line),
        enabledBorder: border(AppColors.line),
        focusedBorder: border(AppColors.b6, 2),
        errorBorder: border(AppColors.red),
        focusedErrorBorder: border(AppColors.red, 2),
        disabledBorder: border(AppColors.line),
        labelStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: AppColors.ink3,
        ),
        floatingLabelStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: AppColors.b6,
        ),
        hintStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.ink4,
        ),
        helperStyle: AppTextStyles.xs,
        errorStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: AppColors.red,
        ),
        prefixIconColor: AppColors.ink3,
        suffixIconColor: AppColors.ink3,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.b7,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.lineStrong,
          disabledForegroundColor: AppColors.ink3,
          elevation: 0,
          shadowColor: Colors.transparent,
          minimumSize: const Size(64, 54),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: const RoundedRectangleBorder(borderRadius: radius18),
          textStyle: labelBtn,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.b7,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.lineStrong,
          disabledForegroundColor: AppColors.ink3,
          minimumSize: const Size(64, 54),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: const RoundedRectangleBorder(borderRadius: radius18),
          textStyle: labelBtn,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          backgroundColor: Colors.transparent,
          minimumSize: const Size(64, 54),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          side: const BorderSide(color: AppColors.lineStrong, width: 1.5),
          shape: const RoundedRectangleBorder(borderRadius: radius18),
          textStyle: labelBtn,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.b6,
          textStyle: const TextStyle(
            fontFamily: AppTextStyles.fontSans,
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
          ),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: AppColors.ink),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.b7,
        foregroundColor: Colors.white,
        elevation: 6,
        highlightElevation: 2,
        shape: RoundedRectangleBorder(borderRadius: radius18),
        extendedTextStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.ink,
        disabledColor: AppColors.slotOff,
        checkmarkColor: Colors.white,
        side: const BorderSide(color: AppColors.line),
        shape: const StadiumBorder(),
        labelStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: AppColors.ink2,
        ),
        secondaryLabelStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        showCheckmark: false,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: AppColors.surface,
        modalBarrierColor: Color(0x8006140F),
        elevation: 0,
        // Les feuilles existantes dessinent leur propre poignée.
        showDragHandle: false,
        dragHandleColor: AppColors.lineStrong,
        dragHandleSize: Size(42, 5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        barrierColor: const Color(0x8006140F),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        titleTextStyle: AppTextStyles.m,
        contentTextStyle: AppTextStyles.small.copyWith(fontSize: 13.5),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        elevation: 0,
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentTextStyle: const TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
        actionTextColor: AppColors.mint,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: const WidgetStatePropertyAll(Colors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? AppColors.b5
              : AppColors.lineStrong,
        ),
        trackOutlineColor:
            const WidgetStatePropertyAll(Colors.transparent),
        thumbIcon: const WidgetStatePropertyAll(null),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? AppColors.b6
              : Colors.transparent,
        ),
        checkColor: const WidgetStatePropertyAll(Colors.white),
        side: const BorderSide(color: AppColors.lineStrong, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? AppColors.b6
              : AppColors.lineStrong,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.b6,
        linearTrackColor: AppColors.line,
        circularTrackColor: Colors.transparent,
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: AppColors.ink,
        unselectedLabelColor: AppColors.ink3,
        indicatorColor: AppColors.b6,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: AppColors.line,
        labelStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
        ),
        indicator: UnderlineTabIndicator(
          borderSide: BorderSide(color: AppColors.b6, width: 3),
          borderRadius: BorderRadius.all(Radius.circular(3)),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected)
                ? Colors.white
                : AppColors.segment,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected)
                ? AppColors.ink
                : AppColors.ink2,
          ),
          side: const WidgetStatePropertyAll(
            BorderSide(color: AppColors.segment, width: 4),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          textStyle: const WidgetStatePropertyAll(
            TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.ink2,
        textColor: AppColors.ink,
        titleTextStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
        subtitleTextStyle: TextStyle(
          fontFamily: AppTextStyles.fontSans,
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: AppColors.ink3,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: AppTextStyles.strong.copyWith(fontSize: 13.5),
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        headerBackgroundColor: AppColors.b7,
        headerForegroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        dayShape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        todayBorder: const BorderSide(color: AppColors.b6, width: 1.5),
      ),
      timePickerTheme: TimePickerThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        hourMinuteShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        dayPeriodShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      expansionTileTheme: const ExpansionTileThemeData(
        shape: Border(),
        collapsedShape: Border(),
        iconColor: AppColors.ink3,
        collapsedIconColor: AppColors.ink3,
      ),
      drawerTheme: const DrawerThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
      ),
    );
  }
}

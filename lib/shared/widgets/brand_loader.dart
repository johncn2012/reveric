// 职责: 品牌加载动画（整屏等待用）— L1 双弧描线入场，之后循环等待，外部标记完成后淡出。
// 关联文件:
//   assets/logo/reveric_mark.svg
//   assets/logo/reveric_wordmark.png
//   lib/main.dart
//   lib/desktop/pages/onboarding.dart
// 遵循的 Rules:
//   .agents/rules/hooks.md
//   .agents/rules/design-system.md
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_hooks/flutter_hooks.dart';

import '../theme/theme.dart';

/// 入场时长（秒）。done 早于入场结束时，等入场播完再退出。
const double _kIntro = 1.9;
const double _kLoopPeriod = 1.8;
const double _kExit = 0.45;
const double _kShowFade = 0.3;

/// 舞台坐标系。双弧画在词标上方，词标仍用 MetaArc 字标。
const Rect _kStage = Rect.fromLTWH(20, 195, 984, 880);
const Rect _kWordmark = Rect.fromLTWH(152, 830, 720, 143);
const double _kCenterX = 512;
const double _kDividerY = 1030;

/// 整屏品牌加载动画。
///
/// [done] 变为 true 后，在入场播完的前提下淡出，结束时回调 [onExited]。
/// [skipIntro] 直接从循环态开始：用于会被反复挂载的启动占位，避免每个阶段重播入场。
/// [showDelay] 仅对 [skipIntro] 生效：这段时间内只铺背景色，超过该时长仍在加载才淡入 logo
/// 并开始循环；期间 done 到达则直接回调，用户完全看不到 logo，避免快速加载时一闪而过。
/// 系统开启「减少动态效果」时直接展示终态（有 showDelay 时保持只铺背景色），done 后立即回调。
class BrandLoader extends HookWidget {
  const BrandLoader({
    super.key,
    this.done = false,
    this.onExited,
    this.skipIntro = false,
    this.showDelay = Duration.zero,
    this.width = 280,
  });

  final bool done;
  final VoidCallback? onExited;
  final bool skipIntro;
  final Duration showDelay;
  final double width;

  @override
  Widget build(BuildContext context) {
    final colors = RevericTheme.colorsOf(context);
    final palette = _BrandPalette.of(Theme.of(context).brightness);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    final vsync = useSingleTickerProvider();
    // 当前时间（秒）与完成请求时刻；ListenableBuilder 只重建动画子树。
    final startOffset = skipIntro ? _kIntro : 0.0;
    final delay = skipIntro
        ? showDelay.inMicroseconds / Duration.microsecondsPerSecond
        : 0.0;
    final clock = useMemoized(() => ValueNotifier<double>(startOffset));
    // logo 可见度：showDelay 期间为 0，之后淡入到 1。
    final appear = useMemoized(() => ValueNotifier<double>(delay > 0 ? 0 : 1));
    final doneAt = useRef<double?>(null);
    final rawNow = useRef(0.0);
    final exited = useRef(false);

    void exitNow() {
      if (exited.value) {
        return;
      }
      exited.value = true;
      SchedulerBinding.instance.addPostFrameCallback((_) => onExited?.call());
    }

    useEffect(() {
      if (reduceMotion) {
        clock.value = _kIntro;
        return null;
      }
      final ticker = vsync.createTicker((elapsed) {
        final raw = elapsed.inMicroseconds / Duration.microsecondsPerSecond;
        rawNow.value = raw;
        if (exited.value) {
          return;
        }
        // 隐藏期内时钟停在循环起点，淡入的同时从头进入循环。
        final t = startOffset + math.max(0.0, raw - delay);
        appear.value = delay > 0
            ? _interval(raw, delay, delay + _kShowFade)
            : 1;
        clock.value = t;
        final requested = doneAt.value;
        if (requested != null && !exited.value) {
          final exitStart = math.max(requested, _kIntro);
          if (t >= exitStart + _kExit) {
            exited.value = true;
            onExited?.call();
          }
        }
      });
      ticker.start();
      return ticker.dispose;
    }, [reduceMotion]);

    useEffect(() {
      if (!done || doneAt.value != null) {
        return null;
      }
      doneAt.value = clock.value;
      // logo 还没露面（隐藏期内）或关闭了动效：不播淡出，直接结束。
      if (reduceMotion || (delay > 0 && rawNow.value < delay)) {
        exitNow();
      }
      return null;
    }, [done]);

    useEffect(() {
      return () {
        clock.dispose();
        appear.dispose();
      };
    }, []);

    final height = width * _kStage.height / _kStage.width;
    final scale = width / _kStage.width;

    return ColoredBox(
      color: colors.canvas,
      child: Center(
        child: SizedBox(
          width: width,
          height: height,
          child: ListenableBuilder(
            listenable: Listenable.merge([clock, appear]),
            builder: (context, _) {
              final t = clock.value;
              if (appear.value == 0) {
                return const SizedBox.shrink();
              }
              final exit = _exitProgress(t, doneAt.value);
              final word = _interval(t, 1.3, 1.9, Curves.easeOutCubic);
              final wordRect = _toLocal(_kWordmark, scale);
              return Opacity(
                opacity: appear.value * (1 - exit),
                child: Transform.scale(
                  scale: 1 + 0.04 * exit,
                  origin: Offset(
                    (_kCenterX - _kStage.center.dx) * scale,
                    (630 - _kStage.center.dy) * scale,
                  ),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _BrandMarkPainter(t: t, palette: palette),
                        ),
                      ),
                      Positioned(
                        left: wordRect.left,
                        top: wordRect.top + 18 * (1 - word) * scale,
                        width: wordRect.width,
                        height: wordRect.height,
                        child: Opacity(
                          opacity: word,
                          child: Center(
                            child: FittedBox(
                              fit: BoxFit.contain,
                              child: Text(
                                'MetaArc',
                                style: TextStyle(
                                  color: palette.word,
                                  fontSize: 88,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 4.0,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  static double _exitProgress(double t, double? doneAt) {
    if (doneAt == null) {
      return 0;
    }
    final exitStart = math.max(doneAt, _kIntro);
    return _interval(t, exitStart, exitStart + _kExit, Curves.easeInCubic);
  }

  static Rect _toLocal(Rect stageRect, double scale) => Rect.fromLTWH(
    (stageRect.left - _kStage.left) * scale,
    (stageRect.top - _kStage.top) * scale,
    stageRect.width * scale,
    stageRect.height * scale,
  );
}

double _interval(
  double t,
  double begin,
  double end, [
  Curve curve = Curves.linear,
]) {
  final x = ((t - begin) / (end - begin)).clamp(0.0, 1.0);
  return curve.transform(x);
}

/// 品牌色：L1 双弧用单一墨色，不随主题 accent 变化，只区分深浅。
class _BrandPalette {
  const _BrandPalette({
    required this.ink,
    required this.accent,
    required this.word,
  });

  /// 双弧描线。
  final Color ink;

  /// 分隔线与循环光点。
  final Color accent;
  final Color word;

  static const _light = _BrandPalette(
    ink: Color(0xFF111111),
    accent: Color(0xFF111111),
    word: Color(0xFF111111),
  );
  static const _dark = _BrandPalette(
    ink: Color(0xFFFFFFFF),
    accent: Color(0xFFFFFFFF),
    word: Color(0xFFFFFFFF),
  );

  static _BrandPalette of(Brightness brightness) =>
      brightness == Brightness.dark ? _dark : _light;
}

class _BrandMarkPainter extends CustomPainter {
  _BrandMarkPainter({required this.t, required this.palette});

  final double t;
  final _BrandPalette palette;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / _kStage.width;
    canvas.save();
    canvas.scale(scale);
    canvas.translate(-_kStage.left, -_kStage.top);

    final drawOuter = _interval(t, 0.0, 0.8, Curves.easeInOutCubic);
    final drawInner = _interval(t, 0.2, 1.0, Curves.easeInOutCubic);
    final word = _interval(t, 1.3, 1.9, Curves.easeOutCubic);

    final looping = t >= _kIntro;
    final loopT = math.max(0.0, t - _kIntro);
    final breathe = looping
        ? (1 - math.cos(loopT / _kLoopPeriod * math.pi * 2)) / 2
        : 0.0;
    final dotP = looping
        ? (1 - math.cos(loopT / _kLoopPeriod * math.pi)) / 2
        : 0.0;

    if (breathe > 0) {
      canvas.drawCircle(
        _MarkPaths.center,
        120,
        Paint()
          ..color = palette.ink.withValues(alpha: 0.08 * breathe)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 40),
      );
    }

    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _MarkPaths.strokeWidth
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..color = palette.ink;
    _drawPartial(canvas, _MarkPaths.outer, drawOuter, stroke);
    _drawPartial(canvas, _MarkPaths.inner, drawInner, stroke);

    if (word > 0) {
      _drawDivider(canvas, word);
    }

    if (looping) {
      canvas.drawCircle(
        Offset(_lerp(_kCenterX - 120, _kCenterX + 120, dotP), _kDividerY),
        5,
        Paint()..color = palette.ink.withValues(alpha: 0.9),
      );
    }

    canvas.restore();
  }

  void _drawPartial(Canvas canvas, Path path, double progress, Paint paint) {
    if (progress <= 0) {
      return;
    }
    for (final metric in path.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * progress), paint);
    }
  }

  void _drawDivider(Canvas canvas, double word) {
    final y = _kDividerY + 18 * (1 - word);
    final half = 128 * word;
    canvas.drawLine(
      Offset(_kCenterX - half, y),
      Offset(_kCenterX + half, y),
      Paint()
        ..color = palette.accent.withValues(alpha: 0.8 * word)
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_BrandMarkPainter oldDelegate) =>
      oldDelegate.t != t || oldDelegate.palette != palette;
}

double _lerp(double a, double b, double p) => a + (b - a) * p;

/// L1 双弧。路径与 designs/website/assets/mark.svg 相同，落到词标上方的舞台坐标。
abstract final class _MarkPaths {
  static const double _scale = 7.25;
  static const double _originX = 280;
  static const double _originY = 200;
  static const double strokeWidth = 5.2 * _scale;

  static Offset _at(double x, double y) =>
      Offset(_originX + x * _scale, _originY + (y + 2) * _scale);

  static final Offset center = _at(32, 32);

  static final outer = _arc(
    (11, 49),
    (13, 26),
    (21, 13),
    (32, 13),
    (43, 13),
    (51, 26),
    (53, 49),
  );
  static final inner = _arc(
    (19.5, 49),
    (21, 35),
    (26.5, 25),
    (32, 25),
    (37.5, 25),
    (43, 35),
    (44.5, 49),
  );

  static Path _arc(
    (double, double) start,
    (double, double) c1,
    (double, double) c2,
    (double, double) mid,
    (double, double) c3,
    (double, double) c4,
    (double, double) end,
  ) {
    final a = _at(start.$1, start.$2);
    final b = _at(c1.$1, c1.$2);
    final c = _at(c2.$1, c2.$2);
    final d = _at(mid.$1, mid.$2);
    final e = _at(c3.$1, c3.$2);
    final f = _at(c4.$1, c4.$2);
    final g = _at(end.$1, end.$2);
    return Path()
      ..moveTo(a.dx, a.dy)
      ..cubicTo(b.dx, b.dy, c.dx, c.dy, d.dx, d.dy)
      ..cubicTo(e.dx, e.dy, f.dx, f.dy, g.dx, g.dy);
  }
}

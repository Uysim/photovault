import { useMemo, useRef, useState, type ComponentRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layoutRail, railYFor, segmentAtY, yearLabels, type RailSegment, type TimelineBucket } from "@photovault/shared";
import { color, font, radius } from "./theme";

/** Width of the touch strip down the right edge; the gallery reserves the same width. */
export const RAIL_WIDTH = 32;

const MIN_SEGMENT = 4;
const LABEL_GAP = 20;
const LATEST_HEIGHT = 36;
const LABEL_HEIGHT = 18;
const IDLE_OPACITY = 0.55;

interface Props {
  buckets: TimelineBucket[];
  active: { year: number; month: number; fraction: number } | null;
  onJump(bucket: TimelineBucket): void;
  onJumpNewest(): void;
}

function monthYear(year: number, month: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
  } catch {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Year/month scrubber down the right edge. Quiet (dim ink) until touched. Dragging shows a
 * month bubble and jumps on release; year labels and the Latest control are buttons, which is
 * also the screen-reader path (the drag itself isn't reachable by VoiceOver/TalkBack).
 */
export function TimelineRail({ buckets, active, onJump, onJumpNewest }: Props) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [dragY, setDragY] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const segments = useMemo(() => layoutRail(buckets, height, MIN_SEGMENT), [buckets, height]);
  const labels = useMemo(() => yearLabels(segments, LABEL_GAP), [segments]);

  // The responder is created once; it reads the latest values through these refs.
  const live = useRef({ segments, buckets, onJump });
  live.current = { segments, buckets, onJump };
  const track = useRef<ComponentRef<typeof View>>(null);
  const trackPageY = useRef(0);

  const measure = () => track.current?.measure((_x: number, _y: number, _w: number, _h: number, _px: number, py: number) => {
      trackPageY.current = py;
    });

  const bucketFor = (seg: RailSegment | null): TimelineBucket | null => {
    if (!seg) return null;
    const { segments: segs, buckets: bs } = live.current;
    return bs[segs.indexOf(seg)] ?? null;
  };

  const responder = useMemo(() => {
    const yOf = (e: GestureResponderEvent) => e.nativeEvent.pageY - trackPageY.current;
    return PanResponder.create({
      // Only the strip's own bounds receive these, so taps on photos are never claimed.
      onStartShouldSetPanResponder: () => true,
      // A drag that starts on a year label takes over from the label once it moves.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: (e) => {
        measure();
        setDragY(yOf(e));
      },
      onPanResponderMove: (e) => setDragY(yOf(e)),
      onPanResponderRelease: (e) => {
        setDragY(null);
        const bucket = bucketFor(segmentAtY(live.current.segments, yOf(e)));
        if (bucket) live.current.onJump(bucket);
      },
      // Cancelled by the system: no jump.
      onPanResponderTerminate: () => setDragY(null),
      // Don't let the list (or a back gesture) take the touch mid-drag.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, []);

  if (buckets.length === 0) return null;

  const dragging = dragY !== null;
  const lit = dragging || pressed;
  const dragSeg = dragging ? segmentAtY(segments, dragY) : null;
  const activeY = active ? railYFor(segments, active, active.fraction) : null;
  const thumbY = dragging ? clamp(dragY, 0, height) : activeY;
  const ink = lit ? color.ink : color.inkDim;

  const onLayout = (e: LayoutChangeEvent) => {
    setHeight(e.nativeEvent.layout.height);
    measure();
  };

  return (
    <View style={[s.rail, { bottom: insets.bottom + 8 }]} {...responder.panHandlers} accessible={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jump to latest"
        hitSlop={{ top: 4, bottom: 4 }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onJumpNewest}
        style={[s.latest, { opacity: lit ? 1 : IDLE_OPACITY }]}
      >
        <View style={[s.latestBar, { backgroundColor: ink }]} />
        <View style={[s.latestArrow, { borderBottomColor: ink }]} />
      </Pressable>

      <View ref={track} style={s.track} onLayout={onLayout}>
        <View
          style={[s.line, { backgroundColor: lit ? color.inkDim : color.clothLine, opacity: lit ? 0.6 : 1 }]}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
        {height > 0 &&
          labels.map((l) => {
            const first = segments.find((x) => x.year === l.year) ?? null;
            const bucket = bucketFor(first);
            return (
              <Pressable
                key={l.year}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${l.year}`}
                hitSlop={{ top: 8, bottom: 8 }}
                onPressIn={() => setPressed(true)}
                onPressOut={() => setPressed(false)}
                onPress={() => bucket && onJump(bucket)}
                style={[s.label, { top: clamp(l.top, 0, Math.max(0, height - LABEL_HEIGHT)) }]}
              >
                <Text
                  style={[s.labelText, { color: ink, opacity: lit ? 1 : IDLE_OPACITY }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.3}
                >
                  {l.year}
                </Text>
              </Pressable>
            );
          })}
        {thumbY !== null && (
          <View
            pointerEvents="none"
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={[
              s.thumb,
              { top: thumbY - 1.5, backgroundColor: dragging ? color.gold : color.ink, opacity: lit ? 1 : IDLE_OPACITY },
            ]}
          />
        )}
        {dragSeg && (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[s.bubble, { top: clamp(dragY! - 18, -LATEST_HEIGHT, Math.max(0, height - 36)) }]}
          >
            <Text style={s.bubbleText} numberOfLines={1}>
              {monthYear(dragSeg.year, dragSeg.month)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  rail: { position: "absolute", top: 0, right: 0, width: RAIL_WIDTH },
  latest: { height: LATEST_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
  latestBar: { width: 10, height: 2, borderRadius: 1 },
  latestArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  track: { flex: 1 },
  line: { position: "absolute", top: 0, bottom: 0, right: 4, width: 1 },
  label: { position: "absolute", left: 0, right: 0, height: LABEL_HEIGHT, justifyContent: "center", alignItems: "flex-end", paddingRight: 7 },
  labelText: { fontFamily: font.semibold, fontSize: 10, fontVariant: ["tabular-nums"] },
  thumb: { position: "absolute", right: 0, width: 10, height: 3, borderRadius: 1.5 },
  bubble: {
    position: "absolute",
    right: RAIL_WIDTH + 4,
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.page,
    borderWidth: 1,
    borderColor: color.gold,
  },
  bubbleText: { fontFamily: font.semibold, fontSize: 15, color: color.ink, fontVariant: ["tabular-nums"] },
});

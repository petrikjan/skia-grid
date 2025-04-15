import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {View, StyleSheet, StatusBar} from 'react-native';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import _ from 'lodash';
import {
  Canvas,
  Group,
  Line,
  Rect,
  rect,
  TextAlign,
  Skia,
  useFonts,
  vec,
  Paint,
} from '@shopify/react-native-skia';
import TeleGroteskNextRegular from './TeleGroteskNext-Regular.ttf';
import {epg, epgMap, channelsBrief} from './epgMock';

const TIME_SLOT_WIDTH = 250;
export const ROW_HEIGHT = 60;
const today = new Date();
const DAY_START = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  0,
  0,
  0,
);
const DAY_END = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  23,
  59,
  59,
);

const CHANNEL_NAME_WIDTH = 100;

const getScrollPositionForCurrentTime = screenWidth => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPositionInPixels = (currentMinutes / 60) * TIME_SLOT_WIDTH;
  const scrollPosition =
    currentPositionInPixels - screenWidth / 2 + CHANNEL_NAME_WIDTH;
  return scrollPosition;
};

const calculateProgramLength = (program: any) => {
  const {start} = program;
  const {end} = program;
  return (end - start) / (1000 * 60);
};

const calculateProgramOffset = (program: any, dayStart: Date) => {
  const {start} = program;
  return (start - dayStart) / (1000 * 60);
};

const generateTimeline = () => {
  const timeline = [];
  const currentTime = new Date(DAY_START);
  currentTime.setMinutes(currentTime.getMinutes() + 30);

  while (currentTime <= DAY_END) {
    const hours = currentTime.getHours().toString().padStart(2, '0');
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    timeline.push(`${hours}:${minutes}`);
    currentTime.setMinutes(currentTime.getMinutes() + 60);
  }
  return timeline;
};

const CEL = memo(
  ({program}) => {
    const rctMargin = rect(
      program.x,
      program.y,
      program.width - 10,
      ROW_HEIGHT,
    );

    return (
      <>
        {program.width > 25 && (
          <Group clip={rctMargin} key={`programCell${program.programId}`}>
            <Group layer={<Paint opacity={program.isAgeBlocked ? 0.5 : 1} />} />
            <Group layer={<Paint opacity={0.5} />} />
          </Group>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    if (_.isEqual(prevProps, nextProps)) {
      return true;
    }
    return false;
  },
);
const ROW = memo(
  ({row}) => {
    'use forget';

    return row.programs.map((program, index) => (
      <Group key={`row${program.programId}`}>
        <CEL program={program} />
        <Line
          p1={vec(program.x + program.width, program.y)}
          p2={vec(program.x + program.width, program.y + ROW_HEIGHT)}
          color={'rgba(255,255,255,0.2)'}
          style="stroke"
          strokeWidth={1}
        />
        {index === 0 && (
          <Line
            p1={vec(program.x, program.y)}
            p2={vec(program.x, program.y + ROW_HEIGHT)}
            color={'rgba(255,255,255,0.2)'}
            style="stroke"
            strokeWidth={1}
          />
        )}
      </Group>
    ));
  },
  (prevProps, nextProps) => {
    if (_.isEqual(prevProps.row, nextProps.row)) {
      return true;
    }
    return false;
  },
);

const useComponentSize = () => {
  const [size, setSize] = useState(null);

  const onLayout = useCallback(event => {
    const {width: widthIn, height: heightIn} = event.nativeEvent.layout;
    const width = widthIn < heightIn ? heightIn : widthIn;
    const height = widthIn < heightIn ? widthIn : heightIn;
    setSize({width, height});
  }, []);

  return [size, onLayout];
};

export const getDateForEpgFetch = (date: Date | null = null) => {
  const today = date || new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const selectedDate = new Date();

const EPG = memo(
  () => {
    'use forget';
    const timeline = useMemo(() => generateTimeline(), []);
    const [size, onLayout] = useComponentSize();
    const [scroll, setScroll] = useState([0, 0]);
    const w = useSharedValue(size?.width || 0);
    const h = useSharedValue(size?.width || 0);
    const [recycled, setRecycled] = useState([]);
    const [cuttedEpg, setCuttedEpg] = useState({});
    const cuttedEpgRef = useRef({});
    const scrollRef = useRef([0, 0]);
    const processing = useRef(false);
    const formattedDate = '2025-04-09';
    const dayStart = useMemo(
      () =>
        new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          0,
          0,
          0,
        ),
      [],
    );

    const {channels} = useMemo(() => {
      return epg[formattedDate] || {channels: []};
    }, [epg, formattedDate]);

    const lastRenderTime = useRef(performance.now());

    useEffect(() => {
      const now = performance.now();
      lastRenderTime.current = now;
    });

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const prevTranslateX = useSharedValue(0);
    const prevTranslateY = useSharedValue(0);

    const totalContentWidth =
      timeline.length * TIME_SLOT_WIDTH + CHANNEL_NAME_WIDTH;
    const totalContentHeight =
      channelsBrief.array.length * ROW_HEIGHT + ROW_HEIGHT;

    const setScrollThrottled = useCallback(
      _.throttle((_x, offset, _y) => {
        setScroll([scrollRef.current[0], scrollRef.current[1]]);
      }, 15),
      [],
    );

    const processScroll = useCallback((_x, offset, _y, roundedY) => {
      scrollRef.current = [_x, offset];
      if (processing.current === false) {
        processing.current = true;
        setScrollThrottled(_x, offset, _y);
      }
    }, []);

    useEffect(() => {
      if (
        scrollRef.current[0] !== scroll[0] ||
        scrollRef.current[1] !== scroll[1]
      ) {
        processing.current = true;
        setScrollThrottled([scrollRef.current[0], scrollRef.current[1]]);
      } else {
        processing.current = false;
      }
    }, [scroll, setScrollThrottled]);

    useEffect(() => {
      w.set(size?.width || 0);
      h.set(size?.height || 0);
    }, [size]);

    useEffect(() => {
      if (size) {
        const position = Math.min(
          getScrollPositionForCurrentTime(size.width) < 0
            ? 0
            : getScrollPositionForCurrentTime(size.width),
          totalContentWidth - size.width,
        );

        translateX.set(-position);
        scrollRef.current = [position, 0];
        setScrollThrottled([position, 0]);
      }
    }, [size]);

    // try to comment this out, then the recycling of components and new programs is not computing
    useAnimatedReaction(
      () => [
        translateX.value,
        Math.floor(-translateY.value / ROW_HEIGHT),
        translateY.value,
        Math.round(-translateY.value / ROW_HEIGHT),
      ],

      (value, previousValue) => {
        if (
          !previousValue ||
          (value[0] === previousValue[0] && value[1] === previousValue[1])
        ) {
          return;
        }
        runOnJS(processScroll)(-value[0], value[1], value[2], value[3]);
      },
    );

    const panGesture = Gesture.Pan()
      .onStart(() => {
        prevTranslateX.set(translateX.value);
        prevTranslateY.set(translateY.value);
      })
      .onUpdate(event => {
        translateX.set(
          Math.min(
            Math.max(
              prevTranslateX.value + event.translationX,
              -totalContentWidth + w.value,
            ),
            0,
          ),
        );
        translateY.set(
          Math.min(
            Math.max(
              prevTranslateY.value + event.translationY,
              -totalContentHeight + h.value,
            ),
            0,
          ),
        );
      })
      .onEnd(event => {
        translateX.set(
          withDecay({
            velocity: event.velocityX,
            clamp: [-totalContentWidth + w.value, 0],
          }),
        );
        translateY.set(
          withDecay({
            velocity: event.velocityY,
            clamp: [-totalContentHeight + h.value, 0],
          }),
        );
      });

    useEffect(() => {
      const from = 0;
      const to = channelsBrief.array.length;
      const out = {};

      if (channelsBrief.array.length > 0 && channels.length > 0) {
        let rowIndex = 0 + from;

        for (let i = from; i < to; i++) {
          if (
            epgMap[formattedDate]?.[channelsBrief.array[i].channelId] !==
            undefined
          ) {
            const ch =
              channels[epgMap[formattedDate][channelsBrief.array[i].channelId]];
            const programs = [];
            for (let n = 0; n < ch.items.length; n++) {
              const programOffset = calculateProgramOffset(
                ch.items[n],
                dayStart,
              );
              const programLength = calculateProgramLength(ch.items[n]);

              const programStartX = programOffset * (TIME_SLOT_WIDTH / 60);
              const programEndX =
                programStartX + (programLength * TIME_SLOT_WIDTH) / 60;

              const x = programStartX + CHANNEL_NAME_WIDTH;
              const y = i * ROW_HEIGHT + ROW_HEIGHT;
              const width = programEndX - programStartX;
              const key = `${ch.channelId}_${ch.items[n].id}`;

              if (
                channelsBrief.array[
                  channelsBrief.map[ch.items[n].channelId]
                ] !== undefined
              ) {
                programs.push({
                  key,
                  programId: ch.items[n].id,
                  channelId: ch.channelId,
                  channelName:
                    channelsBrief.array[
                      channelsBrief.map[ch.items[n].channelId]
                    ].channelName,
                  start: new Date(ch.items[n].start),
                  end: new Date(ch.items[n].end),
                  programName: ch.items[n].title,
                  x,
                  y,
                  width,
                  height: ROW_HEIGHT,
                  genre: ch.items[n].genre,
                });
              }
            }

            out[rowIndex] = [...programs];
            programs.length = 0;
            rowIndex++;
          }
        }

        cuttedEpgRef.current = out;
        setCuttedEpg(Date.now());
      }
      return () => {
        Object.keys(out).forEach(k => delete out[k]);
      };
    }, [formattedDate, channels, epgMap, channelsBrief]);

    useEffect(() => {
      const NUM_ROWS = Math.ceil((size?.height || 0) / ROW_HEIGHT) + 1;
      const recycedRows = [];
      for (let Y = 0; Y < NUM_ROWS; Y++) {
        recycedRows.push({
          y: Y,
          key: `y${Y}`,
        });
      }
      setRecycled(recycedRows);
    }, [size]);

    const GRID = useMemo(() => {
      if (!size) {
        return [];
      }

      const VISIBLE_ROWS_FROM = scroll[1] - 1;
      const VISIBLE_ROWS_TO = Math.ceil((size?.height || 0) / ROW_HEIGHT) + 1;

      const n = Math.floor(scroll[1] / VISIBLE_ROWS_TO) + 1;

      const updatedArray = [];
      recycled.forEach(o => {
        const computedY = o.y + (n - 1) * VISIBLE_ROWS_TO;
        const newY =
          computedY + 1 > VISIBLE_ROWS_FROM && computedY < VISIBLE_ROWS_TO * n
            ? computedY
            : computedY + VISIBLE_ROWS_TO;

        const skip = !cuttedEpgRef.current[newY];

        if (skip) {
          return;
        }

        const res = {
          programs: cuttedEpgRef.current[newY].filter(
            program =>
              program.x + program.width > scroll[0] &&
              program.x < scroll[0] + size.width,
          ),
          key: o.key,
          y: newY,
        };

        updatedArray.push(res);
      });

      const c = updatedArray.map(row => (
        <ROW
          scroll={scroll}
          row={row}
          totalContentWidth={totalContentWidth}
          key={row.key}
          program={row.program}
        />
      ));
      updatedArray.length = 0;
      return c;
    }, [cuttedEpg, recycled, scroll, size]);

    const RowLines = useMemo(
      () =>
        [...channelsBrief.array, {channelId: 'endLine'}].map(
          (channel, index) => (
            <Line
              key={`line_${channel.channelId}`}
              p1={vec(0, (index + 1) * ROW_HEIGHT)}
              p2={vec(totalContentWidth, (index + 1) * ROW_HEIGHT)}
              color={'rgba(255,255,255,0.2)'}
              style="stroke"
              strokeWidth={1}
            />
          ),
        ),
      [channelsBrief.array, totalContentWidth],
    );

    const transform = useDerivedValue(() => [
      {translateX: translateX.value},
      {translateY: translateY.value},
    ]);

    return (
      <GestureHandlerRootView>
        <View style={{flex: 1, backgroundColor: 'black'}} onLayout={onLayout}>
          <StatusBar hidden />

          {size !== null && (
            <View
              style={{
                overflow: 'hidden',
                width: size.width,
                height: size.height,
              }}>
              <>
                <Canvas
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: size.width,
                    height: size.height,
                  }}>
                  <Group transform={transform}>{GRID}</Group>
                  <Group transform={transform}>{RowLines}</Group>
                </Canvas>
                <GestureDetector gesture={panGesture}>
                  <View
                    style={{
                      flexDirection: 'row',
                      width: totalContentWidth,
                      height:
                        totalContentHeight < size.height
                          ? size.height
                          : totalContentHeight,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  />
                </GestureDetector>
              </>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    );
  },
  (prevProps, nextProps) => {
    if (_.isEqual(prevProps, nextProps)) {
      return true;
    }
    return false;
  },
);

export default EPG;

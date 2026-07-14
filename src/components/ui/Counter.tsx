import { motion, useSpring, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useEffect } from 'react';

import './Counter.css';

type Place = number | '.' | ',';

interface NumberProps {
  mv: MotionValue<number>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, (latest: number) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });
  return (
    <motion.span className="counter-number" style={{ y }}>
      {number}
    </motion.span>
  );
}

function normalizeNearInteger(num: number): number {
  const nearest = Math.round(num);
  const tolerance = 1e-9 * Math.max(1, Math.abs(num));
  return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function getValueRoundedToPlace(value: number, place: number): number {
  const scaled = value / place;
  return Math.floor(normalizeNearInteger(scaled));
}

interface DigitProps {
  place: Place;
  value: number;
  height: number;
  digitStyle?: React.CSSProperties;
}

function Digit({ place, value, height, digitStyle }: DigitProps) {
  const isSeparator = place === '.' || place === ',';
  const valueRoundedToPlace = isSeparator ? 0 : getValueRoundedToPlace(value, place as number);
  const animatedValue = useSpring(valueRoundedToPlace);

  useEffect(() => {
    if (!isSeparator) {
      animatedValue.set(valueRoundedToPlace);
    }
  }, [animatedValue, valueRoundedToPlace, isSeparator]);

  if (isSeparator) {
    return (
      <span className="counter-digit" style={{ height, ...digitStyle, width: 'fit-content' }}>
        {place}
      </span>
    );
  }

  return (
    <span className="counter-digit" style={{ height, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </span>
  );
}

/** Build the places array from a numeric value, inserting ',' as a
 * thousands separator every 3 integer digits. */
function defaultPlaces(value: number): Place[] {
  const str = String(value);
  const dotIdx = str.indexOf('.');
  const intLen = dotIdx === -1 ? str.length : dotIdx;
  const places: Place[] = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '.') {
      places.push('.');
    } else {
      let placeVal: number;
      if (dotIdx === -1) {
        placeVal = 10 ** (str.length - i - 1);
      } else if (i < dotIdx) {
        placeVal = 10 ** (dotIdx - i - 1);
      } else {
        placeVal = 10 ** -(i - dotIdx);
      }
      places.push(placeVal);

      const digitsRemaining = intLen - i - 1;
      if (digitsRemaining > 0 && digitsRemaining % 3 === 0) {
        places.push(',');
      }
    }
  }
  return places;
}

export interface CounterProps {
  value: number;
  fontSize?: number;
  padding?: number;
  places?: Place[];
  gap?: number;
  borderRadius?: number;
  horizontalPadding?: number;
  textColor?: string;
  fontWeight?: string | number;
  containerStyle?: React.CSSProperties;
  counterStyle?: React.CSSProperties;
  digitStyle?: React.CSSProperties;
  gradientHeight?: number;
  gradientFrom?: string;
  gradientTo?: string;
  topGradientStyle?: React.CSSProperties;
  bottomGradientStyle?: React.CSSProperties;
}

export const Counter: React.FC<CounterProps> = ({
  value,
  fontSize = 100,
  padding = 0,
  places,
  gap = 8,
  borderRadius = 4,
  horizontalPadding = 8,
  textColor = 'inherit',
  fontWeight = 'inherit',
  containerStyle,
  counterStyle,
  digitStyle,
  gradientHeight = 16,
  gradientFrom = 'black',
  gradientTo = 'transparent',
  topGradientStyle,
  bottomGradientStyle,
}) => {
  const resolvedPlaces = places ?? defaultPlaces(value);
  const height = fontSize + padding;
  const defaultCounterStyle: React.CSSProperties = {
    fontSize,
    gap,
    borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    color: textColor,
    fontWeight,
    direction: 'ltr',
  };
  const defaultTopGradientStyle: React.CSSProperties = {
    height: gradientHeight,
    background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
  };
  const defaultBottomGradientStyle: React.CSSProperties = {
    height: gradientHeight,
    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
  };

  return (
    <span className="counter-container" style={containerStyle}>
      <span className="counter-counter" style={{ ...defaultCounterStyle, ...counterStyle }}>
        {resolvedPlaces.map((place) => (
          <Digit key={place} place={place} value={value} height={height} digitStyle={digitStyle} />
        ))}
      </span>
      <span className="gradient-container">
        <span
          className="top-gradient"
          style={topGradientStyle ?? defaultTopGradientStyle}
        />
        <span
          className="bottom-gradient"
          style={bottomGradientStyle ?? defaultBottomGradientStyle}
        />
      </span>
    </span>
  );
};

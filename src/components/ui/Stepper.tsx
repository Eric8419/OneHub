import React from 'react';
import { Check } from 'lucide-react';

interface Step {
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  activeStep: number;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, activeStep, className = '' }) => {
  return (
    <div
      className={`rb-stepper ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        width: '100%',
      }}
    >
      {steps.map((step, idx) => {
        const isCompleted = idx < activeStep;
        const isActive = idx === activeStep;
        const isLast = idx === steps.length - 1;

        return (
          <React.Fragment key={idx}>
            <div
              className="rb-stepper__step"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--spacer-6)',
                flex: isLast ? 0 : 1,
                minWidth: 0,
              }}
            >
              {/* Circle */}
              <div
                className="rb-stepper__circle"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--body-sm-font-size)',
                  fontWeight: 'var(--font-weight-strong)',
                  transition: 'background var(--transition-normal, 0.2s) ease, color var(--transition-normal, 0.2s) ease, border-color var(--transition-normal, 0.2s) ease',
                  background: isCompleted
                    ? 'var(--bg-brand)'
                    : isActive
                      ? 'var(--bg-brand-popup)'
                      : 'transparent',
                  border: `2px solid ${
                    isCompleted
                      ? 'var(--bg-brand)'
                      : isActive
                        ? 'var(--bg-brand)'
                        : 'var(--border-neutral-l2)'
                  }`,
                  color: isCompleted
                    ? 'var(--text-onbrand)'
                    : isActive
                      ? 'var(--text-brand)'
                      : 'var(--text-disabled)',
                }}
              >
                {isCompleted ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              {/* Label */}
              <div
                className="rb-stepper__label"
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--body-xs-font-size)',
                  lineHeight: 'var(--body-xs-line-height)',
                  color: isActive
                    ? 'var(--text-default)'
                    : isCompleted
                      ? 'var(--text-secondary)'
                      : 'var(--text-disabled)',
                  fontWeight: isActive ? 'var(--font-weight-medium)' : 'var(--body-xs-font-weight)',
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--transition-normal, 0.2s) ease',
                }}
              >
                {step.label}
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className="rb-stepper__connector"
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 13,
                  marginLeft: 'var(--spacer-4)',
                  marginRight: 'var(--spacer-4)',
                  background: isCompleted
                    ? 'var(--bg-brand)'
                    : 'var(--border-neutral-l1)',
                  transition: 'background var(--transition-normal, 0.2s) ease',
                  minWidth: 24,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
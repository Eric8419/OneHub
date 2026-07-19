import React, { useState, Children, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

import './Stepper.css';

interface StepperProps {
  children: React.ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: {
    step: number;
    currentStep: number;
    onStepClick: (step: number) => void;
  }) => React.ReactNode;
}

export const Stepper: React.FC<StepperProps> = ({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  disableStepIndicators = false,
  renderStepIndicator,
  ...rest
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    if (newStep > totalSteps) {
      onFinalStepCompleted();
    } else {
      onStepChange(newStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    setDirection(1);
    updateStep(totalSteps + 1);
  };

  return (
    <div className="rb-stepper-outer" {...rest}>
      <div className={`rb-stepper-circle-container ${stepCircleContainerClassName}`}>
        <div className={`rb-stepper-indicator-row ${stepContainerClassName}`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: (clicked: number) => {
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    },
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={(clicked: number) => {
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    }}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`rb-stepper-content ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={`rb-stepper-footer ${footerClassName}`}>
            <div className={`rb-stepper-footer-nav ${currentStep !== 1 ? 'spread' : 'end'}`}>
              {currentStep !== 1 && (
                <button
                  onClick={handleBack}
                  className={`rb-stepper-btn-back ${currentStep === 1 ? 'inactive' : ''}`}
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              <button
                onClick={isLastStep ? handleComplete : handleNext}
                className="rb-stepper-btn-next"
                {...nextButtonProps}
              >
                {isLastStep ? completeButtonText : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className,
}: {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: React.ReactNode;
  className: string;
}) {
  const [parentHeight, setParentHeight] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const transitionContext: TransitionContext = {
    direction,
    reduced: Boolean(shouldReduceMotion),
  };

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', height: isCompleted ? 0 : parentHeight }}
    >
      <AnimatePresence initial={false} mode="sync" custom={transitionContext}>
        {!isCompleted && (
          <SlideTransition
            key={currentStep}
            transitionContext={transitionContext}
            onHeightReady={(h: number) => setParentHeight(h)}
          >
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </div>
  );
}

function SlideTransition({
  children,
  transitionContext,
  onHeightReady,
}: {
  children: React.ReactNode;
  transitionContext: TransitionContext;
  onHeightReady: (h: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={transitionContext}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transitionContext.reduced ? reducedTransition : normalTransition}
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

interface TransitionContext {
  direction: number;
  reduced: boolean;
}

const stepVariants = {
  enter: ({ direction, reduced }: TransitionContext) => ({
    transform: reduced ? 'translateX(0%)' : `translateX(${direction >= 0 ? '100%' : '-100%'})`,
    opacity: 0,
  }),
  center: {
    transform: 'translateX(0%)',
    opacity: 1,
  },
  exit: ({ direction, reduced }: TransitionContext) => ({
    transform: reduced ? 'translateX(0%)' : `translateX(${direction >= 0 ? '-100%' : '100%'})`,
    opacity: 0,
  }),
};

const normalTransition = {
  duration: 0.25,
  ease: [0.77, 0, 0.175, 1] as const,
};

const reducedTransition = {
  duration: 0.2,
  ease: 'easeOut' as const,
};

export const Step: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="rb-stepper-step-default">{children}</div>;
};

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators,
}: {
  step: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators: boolean;
}) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

  const handleClick = () => {
    if (step !== currentStep && !disableStepIndicators) onClickStep(step);
  };

  return (
    <motion.div
      onClick={handleClick}
      className="rb-stepper-indicator"
      style={disableStepIndicators ? { pointerEvents: 'none', opacity: 0.5 } : {}}
      animate={status}
      initial={false}
    >
      <motion.div
        variants={{
          inactive: { scale: 1, backgroundColor: 'var(--bg-overlay-l1)', color: 'var(--text-tertiary)' },
          active: { scale: 1, backgroundColor: 'var(--bg-brand)', color: 'var(--bg-brand)' },
          complete: { scale: 1, backgroundColor: 'var(--bg-brand)', color: 'var(--text-onbrand)' },
        }}
        transition={{ duration: 0.3 }}
        className="rb-stepper-indicator-inner"
      >
        {status === 'complete' ? (
          <Check className="rb-stepper-check-icon" size={14} strokeWidth={3} />
        ) : status === 'active' ? (
          <div className="rb-stepper-active-dot" />
        ) : (
          <span className="rb-stepper-step-number">{step}</span>
        )}
      </motion.div>
    </motion.div>
  );
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const reduced = Boolean(shouldReduceMotion);
  const lineVariants = {
    incomplete: {
      transform: reduced ? 'scaleX(1)' : 'scaleX(0)',
      backgroundColor: 'transparent',
    },
    complete: {
      transform: 'scaleX(1)',
      backgroundColor: 'var(--bg-brand)',
    },
  };

  return (
    <div className="rb-stepper-connector">
      <motion.div
        className="rb-stepper-connector-inner"
        variants={lineVariants}
        initial={false}
        animate={isComplete ? 'complete' : 'incomplete'}
        transition={reduced ? reducedTransition : normalTransition}
      />
    </div>
  );
}

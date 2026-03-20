'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  GUIDED_TOUR_OPEN_EVENT,
  GUIDED_TOUR_STEPS,
  GUIDED_TOUR_STORAGE_KEY,
  isGuidedTourPath,
  matchesGuidedTourStep,
} from '@/lib/guided-tour';

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

const PANEL_GAP = 18;
const PANEL_MARGIN = 12;
const SPOTLIGHT_PADDING = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function GuidedTour() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const autoOpenedRef = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const activeStep = GUIDED_TOUR_STEPS[currentStepIndex] ?? GUIDED_TOUR_STEPS[0];
  const progressValue = ((currentStepIndex + 1) / GUIDED_TOUR_STEPS.length) * 100;
  const routeIsEligible = Boolean(pathname && isGuidedTourPath(pathname));
  const routeMatchesStep = Boolean(pathname && matchesGuidedTourStep(activeStep, pathname));
  const waitingForRoute = Boolean(activeStep.selector && !routeMatchesStep);
  const waitingForTarget = Boolean(activeStep.selector && routeMatchesStep && !spotlightRect);
  const isCompactViewport =
    viewportSize.width > 0 && (viewportSize.width <= 768 || viewportSize.height <= 720);
  const shouldCenterPanel =
    isCompactViewport ||
    activeStep.placement === 'center' ||
    waitingForRoute ||
    waitingForTarget ||
    !spotlightRect;

  const persistTourState = (value: 'dismissed' | 'completed') => {
    try {
      window.localStorage.setItem(GUIDED_TOUR_STORAGE_KEY, value);
    } catch {
      // Ignore storage limitations.
    }
  };

  const closeTour = (value: 'dismissed' | 'completed') => {
    persistTourState(value);
    setIsOpen(false);
    setSpotlightRect(null);
  };

  const openTour = () => {
    autoOpenedRef.current = true;
    setIsOpen(true);
    setCurrentStepIndex(0);
    setSpotlightRect(null);

    if (!pathname || !matchesGuidedTourStep(GUIDED_TOUR_STEPS[0], pathname)) {
      router.push(GUIDED_TOUR_STEPS[0].route);
    }
  };

  const handleContinue = () => {
    if (currentStepIndex === GUIDED_TOUR_STEPS.length - 1) {
      closeTour('completed');
      return;
    }

    const nextStepIndex = currentStepIndex + 1;
    const nextStep = GUIDED_TOUR_STEPS[nextStepIndex];

    setCurrentStepIndex(nextStepIndex);
    setSpotlightRect(null);

    if (!pathname || !matchesGuidedTourStep(nextStep, pathname)) {
      router.push(nextStep.route);
    }
  };

  useEffect(() => {
    if (!user || !pathname || !routeIsEligible) {
      setIsOpen(false);
      setSpotlightRect(null);
      return;
    }

    if (autoOpenedRef.current) return;

    let savedState: string | null = null;
    try {
      savedState = window.localStorage.getItem(GUIDED_TOUR_STORAGE_KEY);
    } catch {
      savedState = null;
    }

    if (savedState) {
      autoOpenedRef.current = true;
      return;
    }

    autoOpenedRef.current = true;
    setIsOpen(true);
    setCurrentStepIndex(0);
  }, [pathname, routeIsEligible, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpenEvent = () => {
      if (!user) return;
      openTour();
    };

    window.addEventListener(GUIDED_TOUR_OPEN_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener(GUIDED_TOUR_OPEN_EVENT, handleOpenEvent);
    };
  }, [pathname, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewportSize();
    window.addEventListener('resize', syncViewportSize);

    return () => {
      window.removeEventListener('resize', syncViewportSize);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTour('dismissed');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !pathname || !routeMatchesStep || !activeStep.selector) {
      setSpotlightRect(null);
      return;
    }

    const target = document.querySelector(activeStep.selector) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [activeStep.selector, isOpen, pathname, routeMatchesStep]);

  useEffect(() => {
    if (!isOpen || !pathname || !routeMatchesStep || !activeStep.selector) {
      setSpotlightRect(null);
      return;
    }

    let frameId = 0;
    let timeoutId = 0;

    const measureTarget = () => {
      const target = document.querySelector(activeStep.selector!) as HTMLElement | null;
      if (!target) {
        setSpotlightRect(null);
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
          setSpotlightRect(null);
          return;
        }

        const left = Math.max(PANEL_MARGIN, rect.left - SPOTLIGHT_PADDING);
        const top = Math.max(PANEL_MARGIN, rect.top - SPOTLIGHT_PADDING);
        const right = Math.min(window.innerWidth - PANEL_MARGIN, rect.right + SPOTLIGHT_PADDING);
        const bottom = Math.min(window.innerHeight - PANEL_MARGIN, rect.bottom + SPOTLIGHT_PADDING);

        setSpotlightRect({
          left,
          top,
          right,
          bottom,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
        });
      });
    };

    const observer = new MutationObserver(() => {
      measureTarget();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });

    const handleViewportChange = () => {
      measureTarget();
    };

    measureTarget();
    timeoutId = window.setTimeout(measureTarget, 180);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [activeStep.selector, isOpen, pathname, routeMatchesStep]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    if (shouldCenterPanel) {
      setPanelStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const panelWidth = panel.offsetWidth || Math.min(360, window.innerWidth - PANEL_MARGIN * 2);
    const panelHeight = panel.offsetHeight || 260;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = spotlightRect.left + spotlightRect.width / 2;
    const centerY = spotlightRect.top + spotlightRect.height / 2;

    let nextLeft = clamp(centerX - panelWidth / 2, PANEL_MARGIN, viewportWidth - panelWidth - PANEL_MARGIN);
    let nextTop = clamp(spotlightRect.bottom + PANEL_GAP, PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);

    switch (activeStep.placement) {
      case 'top': {
        const preferredTop = spotlightRect.top - panelHeight - PANEL_GAP;
        nextTop =
          preferredTop >= PANEL_MARGIN
            ? preferredTop
            : clamp(spotlightRect.bottom + PANEL_GAP, PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);
        break;
      }
      case 'left': {
        const preferredLeft = spotlightRect.left - panelWidth - PANEL_GAP;
        nextLeft =
          preferredLeft >= PANEL_MARGIN
            ? preferredLeft
            : clamp(spotlightRect.right + PANEL_GAP, PANEL_MARGIN, viewportWidth - panelWidth - PANEL_MARGIN);
        nextTop = clamp(centerY - panelHeight / 2, PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);
        break;
      }
      case 'right': {
        const preferredLeft = spotlightRect.right + PANEL_GAP;
        nextLeft =
          preferredLeft + panelWidth <= viewportWidth - PANEL_MARGIN
            ? preferredLeft
            : clamp(spotlightRect.left - panelWidth - PANEL_GAP, PANEL_MARGIN, viewportWidth - panelWidth - PANEL_MARGIN);
        nextTop = clamp(centerY - panelHeight / 2, PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);
        break;
      }
      case 'bottom':
      default: {
        const preferredTop = spotlightRect.bottom + PANEL_GAP;
        nextTop =
          preferredTop + panelHeight <= viewportHeight - PANEL_MARGIN
            ? preferredTop
            : clamp(spotlightRect.top - panelHeight - PANEL_GAP, PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);
        break;
      }
    }

    setPanelStyle({
      top: `${nextTop}px`,
      left: `${nextLeft}px`,
      transform: 'none',
    });
  }, [activeStep.placement, isOpen, shouldCenterPanel, spotlightRect]);

  if (!isOpen || !user || !pathname || !routeIsEligible) {
    return null;
  }

  return (
    <div className="guided-tour-layer" aria-live="polite">
      {spotlightRect ? (
        <div
          className="guided-tour-spotlight"
          aria-hidden="true"
          style={{
            top: `${spotlightRect.top}px`,
            left: `${spotlightRect.left}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
        />
      ) : (
        <div className="guided-tour-backdrop" aria-hidden="true" />
      )}

      <div
        ref={panelRef}
        className="guided-tour-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        style={panelStyle}
      >
        <button
          type="button"
          className="guided-tour-close"
          aria-label="Close tour"
          onClick={() => closeTour('dismissed')}
        >
          <X className="h-4 w-4" />
        </button>

        <p className="guided-tour-step">Step {currentStepIndex + 1} of {GUIDED_TOUR_STEPS.length}</p>
        <div className="guided-tour-progress" aria-hidden="true">
          <span style={{ width: `${progressValue}%` }} />
        </div>

        <h2 id="guided-tour-title" className="guided-tour-title">
          {activeStep.title}
        </h2>
        <p className="guided-tour-copy">{activeStep.description}</p>

        {waitingForRoute ? (
          <p className="guided-tour-note">Opening this section to continue the tour.</p>
        ) : null}

        {waitingForTarget ? (
          <p className="guided-tour-note">Finding this area on the page.</p>
        ) : null}

        <div className="guided-tour-actions">
          <button type="button" className="guided-tour-skip" onClick={() => closeTour('dismissed')}>
            Skip tour
          </button>
          <button type="button" className="guided-tour-next" onClick={handleContinue}>
            {currentStepIndex === GUIDED_TOUR_STEPS.length - 1 ? 'Get Started' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

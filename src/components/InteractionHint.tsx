import React, { useEffect, useState } from 'react';

export const InteractionHint: React.FC = () => {
  const [isTouch, setIsTouch] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window ||
        (navigator && navigator.maxTouchPoints > 0) ||
        window.innerWidth < 1024
      );
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);

    // Auto fade hint after 12 seconds so screen remains purely cinematic
    const timer = setTimeout(() => {
      setDismissed(true);
    }, 12000);

    return () => {
      window.removeEventListener('resize', checkTouch);
      clearTimeout(timer);
    };
  }, []);

  if (dismissed) return null;

  return (
    <div id="interaction-hint" className="interaction-capsule">
      {isTouch ? (
        <span>1-FINGER: ORBIT • PINCH: ZOOM • DRAG: GRAVITY WELL • 2xTAP: RUPTURE</span>
      ) : (
        <span>DRAG: ORBIT CAMERA • WHEEL: OPTICAL ZOOM • CLICK: TRACTOR BEAM • 2xCLICK: BURST</span>
      )}
    </div>
  );
};

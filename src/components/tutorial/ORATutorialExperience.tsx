import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import Avatar from "../avatar";
import { useTutorialState } from "./useTutorialState";
import "./oraTutorial.css";

const INTRO_TEXT =
  "Bonjour, moi c'est ORA ! Je suis là pour t'accompagner. Clique à nouveau sur moi quand tu es prêt à commencer.";

type ORATutorialExperienceProps = {
  avatarMode: "normal" | "error" | "success";
  onComplete?: () => void;
  active?: boolean;
};

export default function ORATutorialExperience({
  avatarMode,
  onComplete,
  active = true,
}: ORATutorialExperienceProps) {
  const { ready, canTriggerTutorial, shouldAutoStart, hasSeenTutorial, markTutorialSeen } =
    useTutorialState();
  const [open, setOpen] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const textToDisplay = useMemo(() => INTRO_TEXT, []);

  useEffect(() => {
    if (!active || !ready) return;
    if (shouldAutoStart && !hasTriggered) {
      setHasTriggered(true);
      setOpen(true);
    }
  }, [active, ready, shouldAutoStart, hasTriggered]);

  useEffect(() => {
    if (!open) {
      setDisplayedText("");
      setIsTyping(false);
      return;
    }
    setDisplayedText("");
    setIsTyping(true);
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setDisplayedText(textToDisplay.slice(0, index));
      if (index >= textToDisplay.length) {
        window.clearInterval(interval);
        setIsTyping(false);
      }
    }, 30);
    return () => window.clearInterval(interval);
  }, [open, textToDisplay]);

  const handleClose = useCallback(() => {
    setOpen(false);
    void markTutorialSeen().then(() => {
      onComplete?.();
    });
  }, [markTutorialSeen, onComplete]);

  const handleOraClick = useCallback(() => {
    if (!active || !ready) {
      return;
    }
    if (!canTriggerTutorial || hasSeenTutorial) {
      onComplete?.();
      return;
    }
    setHasTriggered(true);
    if (!open) {
      setOpen(true);
      return;
    }
    handleClose();
  }, [active, ready, canTriggerTutorial, hasSeenTutorial, onComplete, open, handleClose]);

  const avatarDisplayMode = open ? "success" : avatarMode;
  const showBubble = active && open;

  if (!active || !ready) {
    return null;
  }

  return (
    <div className="ora-tutorial">
      <button
        type="button"
        className="ora-tutorial__cta"
        onClick={handleOraClick}
        aria-haspopup="dialog"
        aria-expanded={showBubble}
      >
        <Avatar mode={avatarDisplayMode} />
      </button>

      <AnimatePresence>
        {showBubble && (
          <motion.div
            className="ora-tutorial__bubble"
            initial={{ opacity: 0, y: 80, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 120, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <motion.div
              className="ora-tutorial__bubble-inner"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse", delay: 0.3 }}
            >
              <p className="ora-tutorial__text">
                {displayedText}
                <span className={`ora-tutorial__cursor ${isTyping ? "is-typing" : ""}`} />
              </p>
              <button
                type="button"
                className="ora-tutorial__dismiss"
                onClick={handleClose}
                disabled={isTyping}
              >
                Compris !
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


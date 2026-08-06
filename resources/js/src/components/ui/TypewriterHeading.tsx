"use client";
import { motion, type Variants } from "framer-motion";
import type { ElementType } from "react";

const STAGGER = 0.025; // segundos por carácter

const charVariants: Variants = {
  hidden: { opacity: 0 },
  show: (i: number) => ({
    opacity: 1,
    transition: { delay: i * STAGGER, duration: 0.01 },
  }),
};

/**
 * Título que se revela carácter por carácter al entrar en el viewport
 * (efecto "máquina de escribir" de la referencia documental), con un
 * cursor que parpadea mientras "escribe" y se desvanece al terminar.
 * Las palabras se agrupan en `white-space: nowrap` para que el salto de
 * línea siga ocurriendo entre palabras, no a mitad de una.
 */
export function TypewriterHeading({
  text,
  as: Tag = "h3",
  className,
  style,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
}) {
  const words = text.split(/(\s+)/);
  let charIndex = 0;
  const totalChars = text.length;

  return (
    <Tag className={className} style={style}>
      <motion.span
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        style={{ display: "inline" }}
      >
        {words.map((word, wi) => {
          if (/^\s+$/.test(word)) return <span key={wi}>{word}</span>;
          return (
            <span key={wi} style={{ whiteSpace: "nowrap", display: "inline-block" }}>
              {[...word].map((char, ci) => {
                const i = charIndex++;
                return (
                  <motion.span key={ci} custom={i} variants={charVariants} style={{ display: "inline-block" }}>
                    {char}
                  </motion.span>
                );
              })}
            </span>
          );
        })}
        <motion.span
          aria-hidden
          className="anim-cursor-blink"
          style={{ display: "inline-block", marginLeft: 2 }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: totalChars * STAGGER + 0.5, duration: 0.3 }}
        >
          |
        </motion.span>
      </motion.span>
    </Tag>
  );
}

"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.25 });
  return <motion.span className="absolute inset-x-0 bottom-0 h-px origin-left bg-cobalt" style={{ scaleX }} />;
}

export function Reveal({ children, className = "", delay = 0, y = 24 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  const reduceMotion = useReducedMotion();
  return <motion.div initial={reduceMotion ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-70px" }} transition={{ duration: reduceMotion ? 0 : .7, delay: reduceMotion ? 0 : delay, ease: EASE }} className={className}>{children}</motion.div>;
}

export function Stagger({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div initial={reduceMotion ? "show" : "hidden"} whileInView="show" viewport={{ once: true, margin: "-70px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : .09 } } }} className={className}>{children}</motion.div>;
}

export function StaggerItem({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div variants={{ hidden: reduceMotion ? {} : { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : .62, ease: EASE } } }} className={className}>{children}</motion.div>;
}

export function Lift({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <motion.div whileHover={{ y: -4 }} transition={{ duration: .22, ease: EASE }} className={className}>{children}</motion.div>;
}

export function HeroDrift({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, 72]);
  return <motion.div style={{ y }} className={className}>{children}</motion.div>;
}

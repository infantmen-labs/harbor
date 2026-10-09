"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero background media: looping muted video with the AVIF still as
 * poster (instant first paint + reduced-motion/static fallback).
 * Pauses off-screen. Decorative: aria-hidden, no audio track shipped.
 */
export function HeroMedia() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);

  if (reduced) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/hero-tree.avif"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/hero-tree.avif"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    >
      <source src="/hero-bg.mp4" type="video/mp4" />
    </video>
  );
}

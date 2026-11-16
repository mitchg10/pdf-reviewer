"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSentences, speakSentence } from "./api";
import { parseSpeed, SPEED_DEFAULT } from "./speed";
import type { Sentence } from "./types";
import { useStored } from "./useStored";

const PREFETCH_AHEAD = 2;
const KEEP_BEHIND = 5; // blob URLs further back are revoked to cap memory

/** Reading position per document, so reopening a paper resumes where you stopped. */
const posKey = (docId: string) => `reading-position:${docId}`;
function loadPosition(docId: string, count: number): number {
  try {
    const i = Number(localStorage.getItem(posKey(docId)));
    return Number.isInteger(i) && i >= 0 && i < count ? i : 0;
  } catch {
    return 0; // storage blocked
  }
}
function savePosition(docId: string, i: number) {
  try {
    localStorage.setItem(posKey(docId), String(i));
  } catch {
    // storage blocked: position just is not remembered
  }
}

/** Sentence-by-sentence playback: one TTS request per sentence, next ones prefetched. */
export function useReader(docId: string) {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useStored("tts-speed", SPEED_DEFAULT, parseSpeed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<number, Promise<string>>());
  const state = useRef({ index: 0, playing: false, speed: SPEED_DEFAULT, count: 0 });

  useEffect(() => {
    getSentences(docId).then((list) => {
      const i = loadPosition(docId, list.length);
      state.current.index = i;
      setIndex(i);
      setSentences(list);
    }, (e: Error) => setError(e.message));
  }, [docId]);

  const fetchUrl = useCallback(
    (i: number) => {
      const hit = urls.current.get(i);
      if (hit) return hit;
      const p = speakSentence(docId, i).then((b) => URL.createObjectURL(b));
      p.catch(() => urls.current.delete(i)); // let a retry refetch
      urls.current.set(i, p);
      return p;
    },
    [docId],
  );

  const prune = useCallback((i: number) => {
    for (const [k, p] of urls.current) {
      if (k < i - KEEP_BEHIND || k > i + PREFETCH_AHEAD + 1) {
        p.then(URL.revokeObjectURL, () => {});
        urls.current.delete(k);
      }
    }
  }, []);

  const playAt = useCallback(
    async (i: number) => {
      const audio = (audioRef.current ??= new Audio());
      state.current.index = i;
      setIndex(i);
      setLoading(true);
      try {
        const url = await fetchUrl(i);
        if (state.current.index !== i || !state.current.playing) return; // user moved on meanwhile
        audio.src = url;
        audio.defaultPlaybackRate = state.current.speed; // a new src resets playbackRate to this
        audio.playbackRate = state.current.speed;
        audio.preservesPitch = true;
        await audio.play();
        setError(null);
        for (let k = 1; k <= PREFETCH_AHEAD && i + k < state.current.count; k++) fetchUrl(i + k);
        prune(i);
      } catch (e) {
        state.current.playing = false;
        setPlaying(false);
        setError(`Speech failed: ${(e as Error).message}`);
      } finally {
        if (state.current.index === i) setLoading(false);
      }
    },
    [fetchUrl, prune],
  );

  useEffect(() => {
    state.current.count = sentences.length;
  }, [sentences]);

  useEffect(() => {
    if (sentences.length) savePosition(docId, index);
  }, [docId, index, sentences.length]);

  useEffect(() => {
    state.current.speed = speed;
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = speed;
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    const audio = (audioRef.current ??= new Audio());
    const onEnded = () => {
      const next = state.current.index + 1;
      if (state.current.playing && next < state.current.count) playAt(next);
      else {
        state.current.playing = false;
        setPlaying(false);
      }
    };
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [playAt]);

  const play = useCallback(
    (i = state.current.index) => {
      state.current.playing = true;
      setPlaying(true);
      const audio = audioRef.current;
      // resume mid-sentence if the same sentence is loaded and paused
      if (audio?.src && i === state.current.index && audio.paused && audio.currentTime > 0 && !audio.ended) {
        audio.play();
      } else playAt(i);
    },
    [playAt],
  );
  const pause = useCallback(() => {
    state.current.playing = false;
    setPlaying(false);
    audioRef.current?.pause();
  }, []);
  const toggle = useCallback(() => (state.current.playing ? pause() : play()), [play, pause]);
  const jump = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(i, state.current.count - 1));
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      if (state.current.playing) playAt(target);
      else {
        state.current.index = target;
        setIndex(target);
      }
    },
    [playAt],
  );

  return { sentences, index, playing, loading, error, speed, setSpeed, play, pause, toggle, jump };
}

export type Reader = ReturnType<typeof useReader>;

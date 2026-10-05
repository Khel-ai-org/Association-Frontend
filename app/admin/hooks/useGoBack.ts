"use client";

import { useRouter } from 'next/navigation';

// Go back to the page the user actually came from; if there is no history
// (opened via a direct link / new tab), fall back to the given page.
export default function useGoBack(fallbackPath: string) {
  const router = useRouter();
  return () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackPath);
    }
  };
}

// For breadcrumb words: jump back `steps` pages in history, or to the
// fallback page when there isn't enough history (e.g. a direct link).
export function useGoBackSteps() {
  const router = useRouter();
  return (steps: number, fallbackPath: string) => {
    if (typeof window !== 'undefined' && window.history.length > steps) {
      window.history.go(-steps);
    } else {
      router.push(fallbackPath);
    }
  };
}

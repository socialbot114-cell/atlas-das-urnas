import { useEffect, type RefObject } from "react";

// Reveal only cards that enter the viewport. Data is never delayed or counted up.
export function useCardMotion(root: RefObject<HTMLElement | null>, enabled: boolean, scope: string) {
  useEffect(() => {
    const element = root.current;
    if (!enabled || !element || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observed = new WeakSet<Element>();
    const selector = ".motion-card, .kpi, .home-shortcut, .home-stat-tile, .home-leader-tile, .candidate-data-card";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("motion-revealed");
        observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    const register = (node: HTMLElement) => {
      const cards = [...node.querySelectorAll(selector)];
      if (node.matches(selector)) cards.unshift(node);
      for (const card of cards) if (!observed.has(card) && !card.classList.contains("motion-revealed")) {
        observed.add(card); observer.observe(card);
      }
    };
    register(element);
    const mutations = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) register(node);
    });
    mutations.observe(element, { childList: true, subtree: true });
    return () => { mutations.disconnect(); observer.disconnect(); };
  }, [root, enabled, scope]);
}

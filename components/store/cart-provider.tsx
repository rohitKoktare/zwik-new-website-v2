"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { CartLine } from "@/types/cart";

const STORAGE_KEY = "zwik-cart-v1";

type CartAction =
  | { type: "add"; line: Omit<CartLine, "qty">; qty: number }
  | { type: "setQty"; productId: string; qty: number }
  | { type: "remove"; productId: string }
  | { type: "clear" }
  | { type: "hydrate"; lines: CartLine[] };

function reducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "hydrate":
      return action.lines;
    case "add": {
      const existing = lines.find((l) => l.productId === action.line.productId);
      if (!existing) return [...lines, { ...action.line, qty: action.qty }];
      return lines.map((l) =>
        l.productId === action.line.productId ? { ...l, qty: l.qty + action.qty } : l,
      );
    }
    case "setQty": {
      if (action.qty <= 0) return lines.filter((l) => l.productId !== action.productId);
      return lines.map((l) => (l.productId === action.productId ? { ...l, qty: action.qty } : l));
    }
    case "remove":
      return lines.filter((l) => l.productId !== action.productId);
    case "clear":
      return [];
    default:
      return lines;
  }
}

type CartContextValue = {
  lines: CartLine[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  /**
   * Empties the cart. Called once an order is actually placed — until this
   * existed the cart survived ordering, so a customer who came back to the tab
   * still saw everything they had just bought sitting in it.
   */
  clearCart: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, []);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "hydrate", lines: JSON.parse(raw) as CartLine[] });
    } catch {
      // Corrupt/blocked storage — start with an empty cart rather than crash.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage full/blocked — cart still works for this session.
    }
  }, [lines]);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);

    return {
      lines,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addToCart: (line, qty = 1) => {
        dispatch({ type: "add", line, qty });
        setIsOpen(true);
      },
      setQty: (productId, qty) => dispatch({ type: "setQty", productId, qty }),
      removeLine: (productId) => dispatch({ type: "remove", productId }),
      clearCart: () => dispatch({ type: "clear" }),
      count,
      subtotal,
    };
  }, [lines, isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

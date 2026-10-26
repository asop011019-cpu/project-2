import { Link } from "@tanstack/react-router";
import { ArrowLeft, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
export function AccountLink() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="내 계정"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("auth-navigation", { detail: "/account" }))
      }
    >
      <UserRound size={20} aria-hidden="true" />
    </Button>
  );
}
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <header className="flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="처음 화면으로">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <Link to="/" className="label-caps">
          입고 싶은 가능성
        </Link>
      </header>
      <h1 className="font-display text-3xl font-black mt-12 mb-8">{title}</h1>
      {children}
    </main>
  );
}

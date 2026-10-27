import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function GarmentSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            const invalid = contentRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
            if (invalid) {
              e.preventDefault();
              invalid.focus();
            }
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90svh] flex-col overflow-hidden rounded-t-lg border border-border bg-background text-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:animate-none lg:inset-y-0 lg:left-auto lg:right-0 lg:h-svh lg:max-h-svh lg:w-[480px] lg:rounded-none lg:data-[state=open]:slide-in-from-right"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="닫기">
                <X />
              </Button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 overflow-y-auto overflow-x-hidden px-5 py-5">{children}</div>
          <footer className="shrink-0 border-t border-border px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

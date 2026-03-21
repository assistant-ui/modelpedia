import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import type { AuthUser } from "@/lib/auth";

export function UserMenu({ user }: { user: AuthUser }) {
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="ghost" size="icon" title={user.name}>
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="h-6 w-6 rounded-full"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium text-[10px] text-foreground ring-1 ring-border">
              {initials}
            </span>
          )}
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <div className="px-3 py-2">
          <div className="font-medium text-foreground text-sm">{user.name}</div>
          <div className="text-muted-foreground text-xs">{user.email}</div>
        </div>
        <DropdownSeparator />
        <DropdownItem href="/api/auth/logout">
          <LogOut size={14} className="mr-2" />
          Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

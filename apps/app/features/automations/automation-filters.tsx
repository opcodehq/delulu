"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Icon } from "@delulu/design-system/providers/icon";
import { GridViewIcon, Menu01Icon, Search01Icon } from "@delulu/icons";

interface AutomationFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filterStatus: string;
  setFilterStatus: (value: string) => void;
  filterTrigger: string;
  setFilterTrigger: (value: string) => void;
  viewMode: "grid" | "list";
  setViewMode: (value: "grid" | "list") => void;
}

export function AutomationFilters({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterTrigger,
  setFilterTrigger,
  viewMode,
  setViewMode,
}: AutomationFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Search */}
      <div className="relative min-w-0 flex-1">
        <Icon
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          icon={Search01Icon}
          size={16}
        />
        <Input
          className="pl-9"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          value={searchQuery}
        />
      </div>

      {/* Status Filter */}
      <Select onValueChange={setFilterStatus} value={filterStatus}>
        <SelectTrigger className="hidden w-32 sm:flex">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>

      {/* Trigger Type Filter */}
      <Select onValueChange={setFilterTrigger} value={filterTrigger}>
        <SelectTrigger className="hidden w-36 sm:flex">
          <SelectValue placeholder="Trigger" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Triggers</SelectItem>
          <SelectItem value="COMMENT">Comment</SelectItem>
          <SelectItem value="MENTION">Mention</SelectItem>
          <SelectItem value="STORY_REPLY">Story Reply</SelectItem>
        </SelectContent>
      </Select>

      {/* View Mode Toggle */}
      <div className="hidden items-center gap-1 rounded-lg border border-border bg-background p-1 md:flex">
        <Button
          className="px-3"
          onClick={() => setViewMode("list")}
          size="sm"
          variant={viewMode === "list" ? "secondary" : "ghost"}
        >
          <Icon icon={Menu01Icon} size={16} />
        </Button>
        <Button
          className="px-3"
          onClick={() => setViewMode("grid")}
          size="sm"
          variant={viewMode === "grid" ? "secondary" : "ghost"}
        >
          <Icon icon={GridViewIcon} size={16} />
        </Button>
      </div>
    </div>
  );
}

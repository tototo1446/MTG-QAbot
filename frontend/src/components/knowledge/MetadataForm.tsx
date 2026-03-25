"use client";

import Input from "@/components/ui/Input";

interface MetadataFormProps {
  title: string;
  date: string;
  onTitleChange: (value: string) => void;
  onDateChange: (value: string) => void;
  disabled?: boolean;
}

export default function MetadataForm({
  title,
  date,
  onTitleChange,
  onDateChange,
  disabled,
}: MetadataFormProps) {
  return (
    <div className="space-y-4">
      <Input
        id="mtg-title"
        label="MTGタイトル"
        placeholder="例: 第3回プロダクト定例"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        id="mtg-date"
        label="MTG日付"
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

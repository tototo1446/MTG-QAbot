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
        label="MTGタイトル（任意）"
        placeholder="未入力の場合はファイル名が使われます"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        id="mtg-date"
        label="MTG日付（任意）"
        type="date"
        placeholder="未入力の場合は本日の日付が使われます"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

"use client";

interface TerminalChoicesProps {
  choices: string[];
  onSelect: (choice: string) => void;
  disabled?: boolean;
}

export default function TerminalChoices({
  choices,
  onSelect,
  disabled,
}: TerminalChoicesProps) {
  return (
    <div className="flex flex-wrap gap-2 py-2 px-1">
      {choices.map((choice) => (
        <button
          key={choice}
          onClick={() => onSelect(choice)}
          disabled={disabled}
          className="px-3 py-1.5 text-[11px] font-mono text-[#93c5fd] bg-[#60a5fa10] border border-[#60a5fa30] rounded-md hover:bg-[#60a5fa20] hover:border-[#60a5fa50] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {choice}
        </button>
      ))}
    </div>
  );
}

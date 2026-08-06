import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface BaseProps {
  label: string;
  error?: string;
}

type InputProps = BaseProps &
  InputHTMLAttributes<HTMLInputElement> & { multiline?: false };

type TextareaProps = BaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

type Props = InputProps | TextareaProps;

const INPUT_CLASS =
  "w-full bg-white border border-line text-ink placeholder-muted/50 px-3.5 py-2.5 rounded text-sm font-body transition-colors duration-150 outline-none focus:border-blue-mid focus:ring-2 focus:ring-blue-mid/10";

const LABEL_CLASS =
  "block text-[11px] font-semibold tracking-wider uppercase text-muted mb-1.5";

export default function FormField({ label, error, multiline, ...rest }: Props) {
  const autoId = useId();
  const fieldId = (rest as { id?: string }).id ?? autoId;

  return (
    <div>
      <label htmlFor={fieldId} className={LABEL_CLASS}>{label}</label>
      {multiline ? (
        <textarea
          id={fieldId}
          className={`${INPUT_CLASS} resize-y min-h-[100px]`}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={fieldId}
          className={INPUT_CLASS}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

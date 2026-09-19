import { useId } from 'react'

export interface Choice<T extends string> {
  readonly value: T
  readonly label: string
  readonly blurb?: string
}

interface ChoiceGroupProps<T extends string> {
  readonly legend: string
  readonly value: T
  readonly choices: readonly Choice<T>[]
  readonly onChange: (value: T) => void
  /** Options that are coming but cannot be picked. Shown so nobody goes hunting. */
  readonly planned?: readonly string[]
}

/**
 * A stack of big, high-contrast options.
 *
 * Buttons with `role="radio"` rather than real radio inputs: the whole row is the
 * tap target at 3rem minimum (REQUIREMENTS.md §5), which a native radio's dot is
 * not, and it matches the tab pattern already used on the sign-in screen.
 */
export function ChoiceGroup<T extends string>({
  legend,
  value,
  choices,
  onChange,
  planned = [],
}: ChoiceGroupProps<T>) {
  const groupId = useId()

  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-base font-semibold text-fairway-900">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-col gap-2">
        {choices.map((choice) => {
          const selected = choice.value === value
          const blurbId = `${groupId}-${choice.value}`
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={choice.label}
              aria-describedby={choice.blurb === undefined ? undefined : blurbId}
              onClick={() => onChange(choice.value)}
              className={`tap-target flex flex-col justify-center rounded-xl border-2 px-4 py-2 text-left transition ${
                selected
                  ? 'border-fairway-700 bg-fairway-100 text-fairway-900'
                  : 'border-fairway-200 bg-white text-fairway-800'
              }`}
            >
              <span className="text-base font-bold">
                {selected ? '● ' : '○ '}
                {choice.label}
              </span>
              {choice.blurb !== undefined && (
                <span id={blurbId} className="text-sm text-fairway-700">
                  {choice.blurb}
                </span>
              )}
            </button>
          )
        })}
        {planned.map((label) => (
          <p
            key={label}
            aria-disabled="true"
            className="rounded-xl border-2 border-dashed border-fairway-200 px-4 py-2 text-sm text-fairway-600"
          >
            {label} — not built yet
          </p>
        ))}
      </div>
    </fieldset>
  )
}

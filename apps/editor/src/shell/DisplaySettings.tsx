import { useId, type ReactNode } from "react";

export type SettingsField = {
  id: string;
  label: string;
  summary: string;
  control: { kind: "checkbox"; checked: boolean; onChange(): void }
    | { kind: "custom"; render(descriptionId: string): ReactNode };
};
export type SettingsGroup = { label: string; fields: SettingsField[] };

/** Position-independent document settings body; field semantics stay with the caller. */
export function DisplaySettings({ groups, disabled }: { groups: SettingsGroup[]; disabled: boolean }) {
  const id = useId();
  return <div className="display-settings">{groups.map((group, index) => (
    <fieldset key={index} disabled={disabled} className="document-settings-group">
      <legend className="sr-only">{group.label}</legend>
      {group.fields.map(field => {
        const controlId = `${id}-${field.id}`;
        const descriptionId = `${controlId}-hint`;
        return <div key={field.id} className="document-settings-row">
          {field.control.kind === "checkbox" ? <label htmlFor={controlId}>{field.label}</label> : <span>{field.label}</span>}
          <div className="document-settings-control">
            {field.control.kind === "checkbox" ? <input id={controlId} type="checkbox" checked={field.control.checked}
              aria-describedby={descriptionId} onChange={field.control.onChange} /> : field.control.render(descriptionId)}
            <p id={descriptionId} className="display-hint">{field.summary}</p>
          </div>
        </div>;
      })}
    </fieldset>
  ))}</div>;
}

import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { splitDocumentPath } from "./document-path.ts";

type TopBarProps = {
  documentPath: string;
  status: string;
  saveDisabled: boolean;
  /** Why Save is unavailable, when the reason is not obvious from the status. */
  saveHint?: string;
  onSave(): void;
};

/** Document identity on the left; document state and document-level actions on the right. */
export function TopBar({ documentPath, status, saveDisabled, saveHint, onSave }: TopBarProps) {
  const { directory, name } = splitDocumentPath(documentPath);
  const saveButton = (
    <Button
      type="button"
      onClick={onSave}
      disabled={saveDisabled}
      focusableWhenDisabled={Boolean(saveHint)}
      data-testid="save"
    />
  );
  return (
    <header className="top-bar">
      <p className="document-path" data-testid="current-file" title={documentPath || undefined}>
        {documentPath ? (
          <>
            <span className="document-path-directory">{directory}</span>
            <span className="document-path-name">{name}</span>
          </>
        ) : (
          "No file opened"
        )}
      </p>
      <div className="top-bar-actions">
        <p className="status" data-testid="status" role="status">
          {status}
        </p>
        {saveHint ? (
          <Tooltip>
            <TooltipTrigger render={saveButton}>Save</TooltipTrigger>
            <TooltipContent>{saveHint}</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" onClick={onSave} disabled={saveDisabled} data-testid="save">
            Save
          </Button>
        )}
      </div>
    </header>
  );
}

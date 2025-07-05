import { ControllerRenderProps } from "react-hook-form";
import { FormDescription } from "~/components/ui/form";

export type Suggestion = {
  type?: "ai" | "userdoc";
  value?: string;
};

interface Props extends Suggestion {
  field: ControllerRenderProps<any, any>;
}

export const FormSuggestion = ({ field, type, value }: Props) => {
  if (!value) {
    return;
  }

  return (
    <FormDescription
      className="cursor-pointer"
      onClick={() => field.onChange(value)}
    >
      Suggestion{type ? ` (${type})` : ""}: {value}
    </FormDescription>
  );
};

import { ControllerRenderProps } from "react-hook-form";
import { FormDescription } from "~/components/ui/form";

interface Props {
  data?: string;
  field: ControllerRenderProps<any, any>;
}

export const FormSuggestion = ({ field, data }: Props) => {
  if (!data) {
    return;
  }

  return (
    <FormDescription
      className="cursor-pointer"
      onClick={() => field.onChange(data)}
    >
      Suggestion: {data}
    </FormDescription>
  );
};

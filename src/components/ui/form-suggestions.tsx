import { ControllerRenderProps } from "react-hook-form";
import { FormSuggestion, Suggestion } from "./form-suggestion";

interface Props {
  field: ControllerRenderProps<any, any>;
  suggestions?: Suggestion[];
}

export const FormSuggestions = ({ field, suggestions }: Props) => {
  return suggestions?.map((suggestion) => (
    <FormSuggestion key={suggestion.type} field={field} {...suggestion} />
  ));
};

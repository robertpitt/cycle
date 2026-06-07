import { Field as BaseField } from "@base-ui/react/field";
import * as React from "react";

import { Checkbox, type CheckboxProps } from "../../atoms/checkbox/index.ts";
import { Input, type InputProps } from "../../atoms/input/index.ts";
import { Label, type LabelProps } from "../../atoms/label/index.ts";
import { Select, type SelectProps } from "../../atoms/select/index.ts";
import { Switch, type SwitchProps } from "../../atoms/switch/index.ts";
import { Textarea, type TextareaProps } from "../../atoms/textarea/index.ts";
import { cn } from "../../lib/cn.ts";
import { mergeIds } from "../../lib/contracts.ts";

type FieldContextValue = {
  readonly controlId: string;
  readonly descriptionId: string;
  readonly disabled?: boolean;
  readonly errorId: string;
  readonly invalid?: boolean;
  readonly name?: string;
  readonly readOnly?: boolean;
  readonly required?: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

export type FieldProps = Omit<BaseField.Root.Props, "className"> & {
  readonly className?: string;
  readonly controlId?: string;
  readonly readOnly?: boolean;
  readonly required?: boolean;
};

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    children,
    className,
    controlId,
    disabled = false,
    invalid = false,
    name,
    readOnly = false,
    required = false,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const resolvedControlId = controlId ?? `${generatedId}-control`;

  const context = React.useMemo<FieldContextValue>(
    () => ({
      controlId: resolvedControlId,
      descriptionId: `${resolvedControlId}-description`,
      disabled,
      errorId: `${resolvedControlId}-error`,
      invalid,
      name,
      readOnly,
      required,
    }),
    [disabled, invalid, name, readOnly, required, resolvedControlId],
  );

  return React.createElement(
    FieldContext.Provider,
    { value: context },
    React.createElement(
      BaseField.Root,
      {
        ...props,
        ref,
        className: cn("grid gap-1.5", className),
        disabled,
        invalid,
        name,
      },
      children,
    ),
  );
});

export const useFieldContext = () => React.useContext(FieldContext);

type FieldControlProps = {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  readonly disabled?: boolean;
  readonly id?: string;
  readonly invalid?: boolean;
  readonly name?: string;
  readonly readOnly?: boolean;
  readonly required?: boolean;
};

export const useFieldControlProps = <TProps extends FieldControlProps>(props: TProps): TProps => {
  const field = useFieldContext();

  if (!field) {
    return props;
  }

  const invalid = props.invalid ?? field.invalid ?? false;

  return {
    ...props,
    "aria-describedby": mergeIds(
      props["aria-describedby"],
      field.descriptionId,
      invalid ? field.errorId : undefined,
    ),
    "aria-invalid": props["aria-invalid"] ?? (invalid ? true : undefined),
    disabled: props.disabled ?? field.disabled,
    id: props.id ?? field.controlId,
    invalid,
    name: props.name ?? field.name,
    readOnly: props.readOnly ?? field.readOnly,
    required: props.required ?? field.required,
  };
};

export const FieldLabel = React.forwardRef<HTMLLabelElement, LabelProps>(function FieldLabel(
  { children, className, htmlFor, ...props },
  ref,
) {
  const field = useFieldContext();

  return React.createElement(
    Label,
    {
      ...props,
      ref,
      className,
      htmlFor: htmlFor ?? field?.controlId,
    },
    children,
    field?.required
      ? React.createElement(
          "span",
          { "aria-hidden": true, className: "ml-1 text-destructive" },
          "*",
        )
      : null,
  );
});

export type FieldDescriptionProps = Omit<BaseField.Description.Props, "className"> & {
  readonly className?: string;
};

export const FieldDescription = React.forwardRef<HTMLParagraphElement, FieldDescriptionProps>(
  function FieldDescription({ className, ...props }, ref) {
    const field = useFieldContext();

    return React.createElement(BaseField.Description, {
      ...props,
      ref,
      id: props.id ?? field?.descriptionId,
      className: cn("text-sm text-muted-foreground", className),
    });
  },
);

export type FieldErrorProps = Omit<BaseField.Error.Props, "className" | "render"> & {
  readonly className?: string;
};

export const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  function FieldError({ className, match = true, ...props }, ref) {
    const field = useFieldContext();

    return React.createElement(BaseField.Error, {
      ...props,
      ref: ref as React.Ref<HTMLDivElement>,
      id: props.id ?? field?.errorId,
      className: cn("text-sm font-medium text-destructive", className),
      match,
      render: React.createElement("p"),
      role: props.role ?? "alert",
    });
  },
);

export const FieldInput = React.forwardRef<HTMLInputElement, InputProps>(
  function FieldInput(props, ref) {
    return React.createElement(Input, {
      ...useFieldControlProps(props),
      ref,
    });
  },
);

export const FieldSelect = React.forwardRef<HTMLButtonElement, SelectProps>(
  function FieldSelect(props, ref) {
    return React.createElement(Select, {
      ...useFieldControlProps(props),
      ref,
    });
  },
);

export const FieldTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function FieldTextarea(props, ref) {
    return React.createElement(Textarea, {
      ...useFieldControlProps(props),
      ref,
    });
  },
);

export const FieldCheckbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function FieldCheckbox(props, ref) {
    return React.createElement(Checkbox, {
      ...useFieldControlProps(props),
      ref,
    });
  },
);

export const FieldSwitch = React.forwardRef<HTMLInputElement, SwitchProps>(
  function FieldSwitch(props, ref) {
    return React.createElement(Switch, {
      ...useFieldControlProps(props),
      ref,
    });
  },
);

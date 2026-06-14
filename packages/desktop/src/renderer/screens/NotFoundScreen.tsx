import { AppMessageScreen } from "@cycle/ui/organisms";
import { useNavigate } from "react-router";

export const NotFoundScreen = () => {
  const navigate = useNavigate();

  return (
    <AppMessageScreen
      actionLabel="Return home"
      description="The requested screen is not available in this renderer."
      onAction={() => navigate("/")}
      title="Screen not found"
    />
  );
};

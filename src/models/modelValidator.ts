import { OUTPUT } from "../i18n";
import { getAllModelTypes, ModelType } from "./types";

export class ModelValidator {
    private static readonly SUPPORTED_MODELS = getAllModelTypes();

    public static validateModel(model: ModelType): boolean {
        return this.SUPPORTED_MODELS.includes(model);
    }

    public static getErrorMessage(model: ModelType): string {
        return OUTPUT.MODEL.UNSUPPORTED_MODEL_TYPE(model);
    }
}

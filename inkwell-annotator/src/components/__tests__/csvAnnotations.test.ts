import { describe, expect, it } from "vitest";
import { convertBoundingBoxRowsToAnnotations } from "../ImageAnnotator";
import { LABEL_CONFIG, PROFILE_LABEL_CONFIG } from "@/store/annotationStore";

describe("convertBoundingBoxRowsToAnnotations", () => {
  it("converts model CSV rows into annotations", () => {
    const rows = [
      { class_id: "9", x_min: "10", y_min: "20", x_max: "30", y_max: "50", confidence: "1" },
    ];

    const annotations = convertBoundingBoxRowsToAnnotations(rows, "model", "image-123");

    expect(annotations).toHaveLength(1);
    const [annotation] = annotations;

    expect(annotation.category).toBe("model");
    expect(annotation.parentId).toBe("image-123");
    expect(annotation.x).toBeCloseTo(10);
    expect(annotation.y).toBeCloseTo(20);
    expect(annotation.w).toBeCloseTo(20);
    expect(annotation.h).toBeCloseTo(30);

    const expectedLabelIndex = ((9 % LABEL_CONFIG.length) + LABEL_CONFIG.length) % LABEL_CONFIG.length;
    expect(annotation.label).toBe(LABEL_CONFIG[expectedLabelIndex].name);
    expect(annotation.color).toBe(LABEL_CONFIG[expectedLabelIndex].color);
  });

  it("converts profile CSV rows into annotations with sequential labels", () => {
    const rows = [
      { class_id: "1", x_min: "0", y_min: "0", x_max: "100", y_max: "200" },
      { class_id: "2", x_min: "200", y_min: "200", x_max: "400", y_max: "400" },
    ];

    const annotations = convertBoundingBoxRowsToAnnotations(rows, "profile", "image-abc");

    expect(annotations).toHaveLength(2);
    annotations.forEach((annotation) => {
      expect(annotation.category).toBe("profile");
      expect(annotation.parentId).toBe("image-abc");
    });

    expect(annotations[0].label).toBe(PROFILE_LABEL_CONFIG[0].name);
    expect(annotations[0].color).toBe(PROFILE_LABEL_CONFIG[0].color);
    expect(annotations[1].label).toBe(PROFILE_LABEL_CONFIG[1].name);
    expect(annotations[1].color).toBe(PROFILE_LABEL_CONFIG[1].color);
  });

  it("filters out rows with invalid coordinates", () => {
    const rows = [
      { class_id: "1", x_min: "5", y_min: "5", x_max: "5", y_max: "10" },
      { class_id: "2", x_min: "a", y_min: "10", x_max: "20", y_max: "30" },
    ];

    const annotations = convertBoundingBoxRowsToAnnotations(rows, "model", "image-invalid");

    expect(annotations).toHaveLength(0);
  });
});

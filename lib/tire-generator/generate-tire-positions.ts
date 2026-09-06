export type AxleType = "STEER" | "DRIVE" | "FREE_ROLLING";
export type TireConfiguration = "SINGLE" | "DOUBLE";
export type SidePosition = "LEFT" | "RIGHT";
export type TireLayer = "SINGLE" | "INNER" | "OUTER";

export type AxleConfigInput = {
  axle_type: AxleType;
  axle_count: number;
  tire_configuration: TireConfiguration;
};

export type GeneratedTirePosition = {
  axle_type: AxleType;
  axle_number: number;
  position_code: string;
  position_name: string;
  side: SidePosition;
  tire_layer: TireLayer;
  tire_sequence: number;
};

function axleLabel(axleType: AxleType) {
  switch (axleType) {
    case "STEER":
      return "Steer";
    case "DRIVE":
      return "Drive";
    case "FREE_ROLLING":
      return "Free Rolling";
  }
}

function axleCode(axleType: AxleType) {
  switch (axleType) {
    case "STEER":
      return "STEER";
    case "DRIVE":
      return "DRIVE";
    case "FREE_ROLLING":
      return "FREE_ROLLING";
  }
}

function sideLabel(side: SidePosition) {
  return side === "LEFT" ? "Kiri" : "Kanan";
}

export function tireCountForConfiguration(
  axleCount: number,
  tireConfiguration: TireConfiguration
) {
  if (axleCount <= 0) return 0;
  return axleCount * 2 * (tireConfiguration === "DOUBLE" ? 2 : 1);
}

export function generateTirePositions(
  configs: AxleConfigInput[]
): GeneratedTirePosition[] {
  const positions: GeneratedTirePosition[] = [];
  let sequence = 1;

  const orderedTypes: AxleType[] = [
    "STEER",
    "DRIVE",
    "FREE_ROLLING",
  ];

  for (const axleType of orderedTypes) {
    const config = configs.find(
      (item) => item.axle_type === axleType
    );

    if (!config || config.axle_count <= 0) continue;

    for (
      let axleNumber = 1;
      axleNumber <= config.axle_count;
      axleNumber += 1
    ) {
      const label = axleLabel(axleType);
      const code = axleCode(axleType);

      if (config.tire_configuration === "DOUBLE") {
        const layers: Array<{
          layer: TireLayer;
          layerLabel: string;
          codeLabel: string;
        }> = [
          { layer: "OUTER", layerLabel: "Luar", codeLabel: "OUTER" },
          { layer: "INNER", layerLabel: "Dalam", codeLabel: "INNER" },
        ];

        for (const side of ["LEFT", "RIGHT"] as const) {
          for (const item of layers) {
            positions.push({
              axle_type: axleType,
              axle_number: axleNumber,
              position_code: `${code}_${axleNumber}_${side}_${item.codeLabel}`,
              position_name: `${label} ${axleNumber} ${sideLabel(side)} ${item.layerLabel}`,
              side,
              tire_layer: item.layer,
              tire_sequence: sequence,
            });
            sequence += 1;
          }
        }
      } else {
        for (const side of ["LEFT", "RIGHT"] as const) {
          const layer: TireLayer = axleType === "STEER" ? "SINGLE" : "OUTER";
          const layerSuffix = axleType === "STEER" ? "" : " Luar";
          const codeSuffix = axleType === "STEER" ? "SINGLE" : "OUTER";

          positions.push({
            axle_type: axleType,
            axle_number: axleNumber,
            position_code: `${code}_${axleNumber}_${side}_${codeSuffix}`,
            position_name: `${label} ${axleNumber} ${sideLabel(side)}${layerSuffix}`,
            side,
            tire_layer: layer,
            tire_sequence: sequence,
          });
          sequence += 1;
        }
      }
    }
  }

  return positions;
}

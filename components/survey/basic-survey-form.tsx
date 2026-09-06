"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateTirePositions } from "@/lib/tire-generator/generate-tire-positions";
import { PhotoUploadSection } from "@/components/survey/photo-upload-section";

type Option = {
  id: number;
  name: string;
};

type CityOption = Option & {
  province_id: number;
};

type AxleType = "STEER" | "DRIVE" | "FREE_ROLLING";
type TireConfiguration = "SINGLE" | "DOUBLE";

type AxleConfig = {
  axle_type: AxleType;
  axle_count: number;
  tire_configuration: TireConfiguration;
};

type Survey = {
  id: string;
  serial_number: string | null;
  status: "DRAFT" | "QC_REVISION";
  survey_date: string;
  plate_number: string | null;
  province_id: number | null;
  city_id: number | null;
  city_other: string | null;
  vehicle_category: "TB" | "LT" | null;
  segment: "BUS" | "TRUCK" | null;
  bus_category: "INTERCITY_BUS" | "CITY_BUS" | null;
  truck_category:
    | "GENERAL_CARGO"
    | "DUMP_TRUCK"
    | "TANKER"
    | "TRAILER"
    | null;
  specific_vehicle_type: string | null;
  company_name: string | null;
  vehicle_brand_id: number | null;
  vehicle_brand_other: string | null;
  cargo_type: string | null;
  total_axles: number | null;
  total_tires: number | null;
};

type Props = {
  survey: Survey;
  supplierName: string;
  supplierCode: string | null;
  provinces: Option[];
  cities: CityOption[];
  vehicleBrands: Option[];
  axleConfigs: AxleConfig[];
};

const cargoOptions = [
  {
    value: "CARGO_TRUCK",
    label: "Cargo Truck",
  },
  {
    value: "BOX_TRUCK",
    label: "Box Truck",
  },
  {
    value: "CAR_CARRIER",
    label: "Car Carrier",
  },
  {
    value: "MIXER",
    label: "Mixer",
  },
  {
    value: "FLAT_DECK_TRUCK",
    label: "Flat Deck Truck",
  },
  {
    value: "OTHER",
    label: "Lainnya",
  },
];

const tankerOptions = [
  {
    value: "TANGKI_BBM",
    label: "Tangki BBM",
  },
  {
    value: "TANGKI_AIR",
    label: "Tangki Air",
  },
  {
    value: "TANGKI_KIMIA",
    label: "Tangki Kimia",
  },
  {
    value: "OTHER",
    label: "Lainnya",
  },
];

const cargoTypeOptions = [
  {
    value: "NO_CARGO",
    label: "Tidak ada muatan",
  },
  {
    value: "CARGO_BOX",
    label: "Cargo / Box",
  },
  {
    value: "OTHER",
    label: "Muatan lainnya",
  },
];

function getOtherSpecificType(
  truckCategory: Survey["truck_category"],
  value: string | null
) {
  if (
    truckCategory === "GENERAL_CARGO" &&
    value &&
    cargoOptions.some((option) => option.value === value)
  ) {
    return "";
  }

  if (
    truckCategory === "TANKER" &&
    value &&
    tankerOptions.some((option) => option.value === value)
  ) {
    return "";
  }

  return value ?? "";
}

function isKnownCargoType(value: string | null) {
  return cargoTypeOptions.some(
    (option) => option.value === value
  );
}

function validateAxleConfiguration(configs: AxleConfig[]) {
  const steer = configs.find(
    (config) => config.axle_type === "STEER"
  );

  const drive = configs.find(
    (config) => config.axle_type === "DRIVE"
  );

  const freeRolling = configs.find(
    (config) => config.axle_type === "FREE_ROLLING"
  );

  const steerCount = steer?.axle_count ?? 0;
  const driveCount = drive?.axle_count ?? 0;
  const freeRollingCount = freeRolling?.axle_count ?? 0;

  const totalAxles =
    steerCount +
    driveCount +
    freeRollingCount;

  if (totalAxles === 0) {
    return {
      valid: true,
      message: "Belum dikonfigurasi",
    };
  }

  if (![2, 3, 4, 5, 6].includes(totalAxles)) {
    return {
      valid: false,
      message: "Jumlah poros harus 2 sampai 6 poros.",
    };
  }

  if (steerCount === 0) {
    return {
      valid: false,
      message: "Steer minimal harus 1 poros.",
    };
  }

  if (driveCount === 0) {
    return {
      valid: false,
      message: "Drive minimal harus 1 poros.",
    };
  }

  if (
    freeRollingCount > 0 &&
    steerCount + driveCount < 3
  ) {
    return {
      valid: false,
      message:
        "Free Rolling hanya boleh digunakan jika Steer + Drive minimal 3 poros.",
    };
  }

  return {
    valid: true,
    message: "Valid",
  };
}

export function BasicSurveyForm({
  survey,
  supplierName,
  supplierCode,
  provinces,
  cities,
  vehicleBrands,
  axleConfigs,
}: Props) {
  const [plate, setPlate] = useState(
    survey.plate_number ?? ""
  );

  const [surveyDate, setSurveyDate] = useState(
    survey.survey_date
  );

  const [provinceId, setProvinceId] = useState(
    survey.province_id?.toString() ?? ""
  );

  const [cityId, setCityId] = useState(
    survey.city_id?.toString() ?? ""
  );

  const [cityOther, setCityOther] = useState(
    survey.city_other ?? ""
  );

  const [vehicleCategory, setVehicleCategory] =
    useState<"" | "TB" | "LT">(
      survey.vehicle_category ?? ""
    );

  const [segment, setSegment] = useState<
    "" | "BUS" | "TRUCK"
  >(survey.segment ?? "");

  const [busCategory, setBusCategory] = useState(
    survey.bus_category ?? ""
  );

  const [truckCategory, setTruckCategory] =
    useState<
      | ""
      | "GENERAL_CARGO"
      | "DUMP_TRUCK"
      | "TANKER"
      | "TRAILER"
    >(survey.truck_category ?? "");

  const [specificType, setSpecificType] = useState(
    survey.specific_vehicle_type &&
    (
      survey.truck_category === "GENERAL_CARGO"
        ? cargoOptions.some(
            (option) =>
              option.value === survey.specific_vehicle_type
          )
        : survey.truck_category === "TANKER"
          ? tankerOptions.some(
              (option) =>
                option.value === survey.specific_vehicle_type
            )
          : false
    )
      ? survey.specific_vehicle_type
      : ""
  );

  const [otherSpecificType, setOtherSpecificType] =
    useState(
      getOtherSpecificType(
        survey.truck_category,
        survey.specific_vehicle_type
      )
    );

  const [companyName, setCompanyName] = useState(
    survey.company_name ?? ""
  );

  const [vehicleBrandId, setVehicleBrandId] =
    useState(
      survey.vehicle_brand_id?.toString() ??
        (survey.vehicle_brand_other ? "OTHER" : "")
    );

  const [vehicleBrandOther, setVehicleBrandOther] =
    useState(survey.vehicle_brand_other ?? "");

  const [cargoType, setCargoType] = useState(
    isKnownCargoType(survey.cargo_type)
      ? survey.cargo_type ?? ""
      : survey.cargo_type
        ? "OTHER"
        : ""
  );

  const [otherCargo, setOtherCargo] = useState(
    survey.cargo_type && !isKnownCargoType(survey.cargo_type)
      ? survey.cargo_type
      : ""
  );

  const [axleState, setAxleState] = useState<AxleConfig[]>(() =>
    (["STEER", "DRIVE", "FREE_ROLLING"] as AxleType[]).map((axleType) => {
      const existing = axleConfigs.find(
        (config) => config.axle_type === axleType
      );

      return (
        existing ?? {
          axle_type: axleType,
          axle_count: 0,
          tire_configuration: axleType === "FREE_ROLLING" ? "DOUBLE" : "SINGLE",
        }
      );
    })
  );

  const [plateMessage, setPlateMessage] = useState("");
  const [plateAvailable, setPlateAvailable] =
    useState<boolean | null>(null);

  const [saving, setSaving] = useState(false);
  const [checkingPlate, setCheckingPlate] =
    useState(false);
  const [message, setMessage] = useState("");
  const [submittedSerial, setSubmittedSerial] = useState("");
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const didMountRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const saveControllerRef = useRef<AbortController | null>(null);

  const normalizedPlate = useMemo(
    () => plate.toUpperCase().replace(/\s+/g, ""),
    [plate]
  );

  const totalAxleNumber = useMemo(
    () => axleState.reduce((sum, config) => sum + config.axle_count, 0),
    [axleState]
  );

  const axleConfigValidation = useMemo(
  () => validateAxleConfiguration(axleState),
  [axleState]
);

  const baseAxleNumber = useMemo(
    () =>
      axleState
        .filter((config) => config.axle_type !== "FREE_ROLLING")
        .reduce((sum, config) => sum + config.axle_count, 0),
    [axleState]
  );


  const totalTireCount = useMemo(
    () =>
      axleState.reduce(
        (sum, config) =>
          sum +
          config.axle_count *
            2 *
            (config.tire_configuration === "DOUBLE" ? 2 : 1),
        0
      ),
    [axleState]
  );

  const generatedPositions = useMemo(
    () => generateTirePositions(axleState),
    [axleState]
  );

  function updateAxleState(
    axleType: AxleType,
    patch: Partial<AxleConfig>
  ) {
    setAxleState((current) => {
      const next = current.map((config) =>
        config.axle_type === axleType
          ? { ...config, ...patch }
          : config
      );

      const nextBaseAxles = next
        .filter((config) => config.axle_type !== "FREE_ROLLING")
        .reduce((sum, config) => sum + config.axle_count, 0);

      if (nextBaseAxles < 3) {
        return next.map((config) =>
          config.axle_type === "FREE_ROLLING"
            ? { ...config, axle_count: 0 }
            : config
        );
      }

      return next;
    });
  }

  const filteredCities = useMemo(
    () =>
      provinceId
        ? cities.filter(
            (city) =>
              city.province_id.toString() === provinceId
          )
        : [],
    [cities, provinceId]
  );

  async function checkPlate(): Promise<boolean> {
    if (!normalizedPlate) {
      setPlateAvailable(null);
      setPlateMessage("");
      return false;
    }

    setCheckingPlate(true);
    setPlateMessage("");

    try {
      const response = await fetch(
        `/api/surveys/${survey.id}/plate-check?plate=${encodeURIComponent(
          normalizedPlate
        )}`
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Gagal memeriksa Nomor Polisi."
        );
      }

      const available = Boolean(payload.available);
      setPlateAvailable(available);
      setPlateMessage(payload.message);
      return available;
    } catch (error) {
      setPlateAvailable(null);
      setPlateMessage(
        error instanceof Error
          ? error.message
          : "Gagal memeriksa Nomor Polisi."
      );
      return false;
    } finally {
      setCheckingPlate(false);
    }
  }

  const buildDraftPayload = useCallback(() => {
    const finalSpecificType =
      specificType === "OTHER"
        ? otherSpecificType.trim()
        : specificType.trim();

    const finalCargo =
      cargoType === "OTHER"
        ? otherCargo.trim()
        : cargoType.trim();

    return {
      survey_date: surveyDate,
      plate_number: normalizedPlate,
      province_id: provinceId
        ? Number(provinceId)
        : null,
      city_id:
        cityId === "OTHER"
          ? null
          : cityId
            ? Number(cityId)
            : null,
      city_other:
        cityId === "OTHER"
          ? cityOther
          : null,
      vehicle_category:
        vehicleCategory || null,
      segment:
        segment || null,
      bus_category:
        segment === "BUS"
          ? busCategory || null
          : null,
      truck_category:
        segment === "TRUCK"
          ? truckCategory || null
          : null,
      specific_vehicle_type:
        segment === "TRUCK"
          ? finalSpecificType || null
          : null,
      company_name:
        companyName.trim() || null,
      vehicle_brand_id:
        vehicleBrandId === "OTHER"
          ? null
          : vehicleBrandId
            ? Number(vehicleBrandId)
            : null,
      vehicle_brand_other:
        vehicleBrandId === "OTHER"
          ? vehicleBrandOther.trim() || null
          : null,
      cargo_type:
        finalCargo || null,
      axle_configs: axleState,
    };
  }, [
    axleState,
    busCategory,
    cargoType,
    cityId,
    cityOther,
    companyName,
    normalizedPlate,
    otherCargo,
    otherSpecificType,
    provinceId,
    segment,
    specificType,
    surveyDate,
    truckCategory,
    vehicleBrandId,
    vehicleBrandOther,
    vehicleCategory,
  ]);

  const saveDraft = useCallback(
    async (mode: "manual" | "auto") => {
      const payloadBody = buildDraftPayload();
      const signature = JSON.stringify(payloadBody);

      if (mode === "auto" && signature === lastSavedSignatureRef.current) {
        return true;
      }

      saveControllerRef.current?.abort();
      const controller = new AbortController();
      saveControllerRef.current = controller;

      if (mode === "manual") {
        setSaving(true);
        setMessage("");
      } else {
        setAutoSaveStatus("saving");
      }

      try {
        const response = await fetch(
          `/api/surveys/${survey.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payloadBody),
            signal: controller.signal,
          }
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error ??
              "Gagal menyimpan data survey."
          );
        }

        lastSavedSignatureRef.current = signature;

        if (payload.data?.plate_number) {
          setPlate(payload.data.plate_number);
        }

        if (mode === "manual") {
          setPlateAvailable(true);
          setPlateMessage("Nomor Polisi tersedia.");
          setMessage("Data berhasil disimpan.");
        } else {
          setAutoSaveStatus("saved");
        }

        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return false;
        }

        if (mode === "manual") {
          setMessage(
            error instanceof Error
              ? error.message
              : "Gagal menyimpan data survey."
          );
        } else {
          setAutoSaveStatus("error");
        }

        return false;
      } finally {
        if (mode === "manual") {
          setSaving(false);
        }

        if (saveControllerRef.current === controller) {
          saveControllerRef.current = null;
        }
      }
    },
    [buildDraftPayload, survey.id]
  );

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      lastSavedSignatureRef.current = JSON.stringify(buildDraftPayload());
      return;
    }

    const timer = window.setTimeout(() => {
      void saveDraft("auto");
    }, 800);

    return () => window.clearTimeout(timer);
  }, [buildDraftPayload, saveDraft]);

  useEffect(() => {
    return () => {
      saveControllerRef.current?.abort();
    };
  }, []);

  function getClientSubmitErrors() {
    const errors: string[] = [];

    if (!surveyDate) errors.push("Tanggal Survey wajib diisi.");
    if (!normalizedPlate) errors.push("Nomor Polisi wajib diisi.");
    if (!provinceId) errors.push("Provinsi wajib dipilih.");
    if (!cityId) {
      errors.push("Kota wajib dipilih.");
    } else if (cityId === "OTHER" && !cityOther.trim()) {
      errors.push("Nama kota wajib diisi jika memilih Lainnya.");
    }
    if (!vehicleCategory) errors.push("Kategori Kendaraan TB/LT wajib dipilih.");
    if (!segment) errors.push("Segmen Utama wajib dipilih.");

    if (segment === "BUS" && !busCategory) {
      errors.push("Kategori Bus wajib dipilih.");
    }

    if (segment === "TRUCK") {
      if (!truckCategory) {
        errors.push("Kategori Truck wajib dipilih.");
      } else if (!specificType) {
        if (truckCategory === "GENERAL_CARGO") {
          errors.push("Spesifik Cargo wajib dipilih.");
        } else if (truckCategory === "TANKER") {
          errors.push("Spesifik Tanker wajib dipilih.");
        }
      }

      if (specificType === "OTHER" && !otherSpecificType.trim()) {
        errors.push("Jenis manual pada pilihan Lainnya wajib diisi.");
      }
    }

    if (!vehicleBrandId) {
      errors.push("Merk Kendaraan wajib dipilih.");
    } else if (vehicleBrandId === "OTHER" && !vehicleBrandOther.trim()) {
      errors.push("Merk Kendaraan manual wajib diisi.");
    }

    if (!axleConfigValidation.valid || totalAxleNumber < 2) {
      errors.push(axleConfigValidation.message || "Konfigurasi poros belum valid.");
    }

    return errors;
  }

  async function handleSubmitSurvey() {
    if (submittedSerial) return;

    if (plateAvailable !== true) {
      const available = await checkPlate();
      if (!available) {
        setMessage("Nomor Polisi harus diperiksa dan dinyatakan tersedia sebelum Submit.");
        return;
      }
    }

    const clientErrors = getClientSubmitErrors();
    if (clientErrors.length > 0) {
      setMessage(clientErrors.join("\n"));
      return;
    }

    setSubmittingSurvey(true);
    setMessage("");

    try {
      const saved = await saveDraft("manual");
      if (!saved) {
        setMessage("Data belum berhasil disimpan. Submit dibatalkan.");
        return;
      }

      const response = await fetch(`/api/surveys/${survey.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (Array.isArray(payload.errors) && payload.errors.length > 0) {
          setMessage(payload.errors.join("\n"));
        } else {
          setMessage(payload.error ?? "Survey gagal disubmit.");
        }
        return;
      }

      setSubmittedSerial(payload.serial_number ?? "");
      setMessage(
        survey.status === "QC_REVISION"
        ? `Survey revisi berhasil dikirim kembali ke QC dengan Serial Number ${payload.serial_number}.`
        : `Survey berhasil disubmit dengan Serial Number ${payload.serial_number}.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Survey gagal disubmit."
      );
    } finally {
      setSubmittingSurvey(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (plateAvailable === false) {
      setMessage(
        "Perbaiki Nomor Polisi yang duplikat sebelum menyimpan."
      );
      return;
    }

    if (!axleConfigValidation.valid) {
      setMessage(
        axleConfigValidation.message
      );
      return;
    }

    if (
      axleState.some(
        (config) =>
          !Number.isInteger(config.axle_count) ||
          config.axle_count < 0
      )
    ) {
      setMessage("Jumlah poros tidak valid.");
      return;
    }

    await saveDraft("manual");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <SectionTitle
          number="01"
          title="Identitas Surveyor"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <ReadOnlyField
            label="ID Data Supplier"
            value={supplierCode ?? "-"}
          />

          <ReadOnlyField
            label="Nama Data Supplier"
            value={supplierName}
          />

          <Field label="Tanggal Survey">
            <input
              type="date"
              value={surveyDate}
              onChange={(event) =>
                setSurveyDate(event.target.value)
              }
              className="input"
              required
            />
          </Field>

        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <SectionTitle
          number="02"
          title="Identitas Kendaraan"
        />

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Nomor Polisi *">
            <input
              value={plate}
              onChange={(event) => {
                setPlate(event.target.value);
                setPlateAvailable(null);
                setPlateMessage("");
                setMessage("");
              }}
              onBlur={() => {
                setPlate(normalizedPlate);
                void checkPlate();
              }}
              placeholder="Contoh: B1234ABC"
              className="input"
              required
            />

            <div className="mt-1 text-xs">
              {checkingPlate ? (
                <span className="text-slate-500">
                  Memeriksa Nomor Polisi...
                </span>
              ) : plateAvailable === true ? (
                <span className="text-green-600">
                  {plateMessage}
                </span>
              ) : plateAvailable === false ? (
                <span className="text-red-600">
                  {plateMessage}
                </span>
              ) : (
                <span className="text-slate-500">
                  Disimpan tanpa spasi dan otomatis huruf
                  kapital.
                </span>
              )}
            </div>
          </Field>

          <Field label="Provinsi *">
            <select
              value={provinceId}
              onChange={(event) => {
                setProvinceId(event.target.value);
                setCityId("");
                setCityOther("");
              }}
              className="input"
              required
            >
              <option value="">Pilih provinsi</option>

              {provinces.map((province) => (
                <option
                  key={province.id}
                  value={province.id}
                >
                  {province.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Kota *">
            <select
              value={cityId}
              onChange={(event) => {
                setCityId(event.target.value);

                if (event.target.value !== "OTHER") {
                  setCityOther("");
                }
              }}
              className="input"
              disabled={!provinceId}
              required
            >
              <option value="">
                {provinceId
                  ? "Pilih kota"
                  : "Pilih provinsi terlebih dahulu"}
              </option>

              {filteredCities.map((city) => (
                <option
                  key={city.id}
                  value={city.id}
                >
                  {city.name}
                </option>
              ))}

              {provinceId ? (
                <option value="OTHER">Lainnya</option>
              ) : null}
            </select>

            {cityId === "OTHER" ? (
              <input
                value={cityOther}
                onChange={(event) =>
                  setCityOther(event.target.value)
                }
                placeholder="Tulis nama kota"
                className="input mt-2"
                required
              />
            ) : null}
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <SectionTitle
          number="03"
          title="Klasifikasi & Spesifikasi Kendaraan"
        />

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Kategori Kendaraan TB/LT *">
            <select
              value={vehicleCategory}
              onChange={(event) =>
                setVehicleCategory(
                  event.target.value as
                    | ""
                    | "TB"
                    | "LT"
                )
              }
              className="input"
              required
            >
              <option value="">
                Pilih kategori
              </option>
              <option value="TB">TB</option>
              <option value="LT">LT</option>
            </select>
          </Field>

          <Field label="Segmen Utama *">
            <select
              value={segment}
              onChange={(event) => {
                const value = event.target.value as
                  | ""
                  | "BUS"
                  | "TRUCK";

                setSegment(value);
                setBusCategory("");
                setTruckCategory("");
                setSpecificType("");
                setOtherSpecificType("");
              }}
              className="input"
              required
            >
              <option value="">
                Pilih segmen
              </option>
              <option value="BUS">Bus</option>
              <option value="TRUCK">Truck</option>
            </select>
          </Field>

          {segment === "BUS" ? (
            <Field label="Kategori Bus *">
              <select
                value={busCategory}
                onChange={(event) =>
                  setBusCategory(
                    event.target.value
                  )
                }
                className="input"
                required
              >
                <option value="">
                  Pilih kategori bus
                </option>
                <option value="INTERCITY_BUS">
                  Intercity Bus (AKAP)
                </option>
                <option value="CITY_BUS">
                  City Bus (Bus Kota)
                </option>
              </select>
            </Field>
          ) : null}

          {segment === "TRUCK" ? (
            <Field label="Kategori Truck *">
              <select
                value={truckCategory}
                onChange={(event) => {
                  setTruckCategory(
                    event.target.value as
                      | ""
                      | "GENERAL_CARGO"
                      | "DUMP_TRUCK"
                      | "TANKER"
                      | "TRAILER"
                  );

                  setSpecificType("");
                  setOtherSpecificType("");
                }}
                className="input"
                required
              >
                <option value="">
                  Pilih kategori truck
                </option>
                <option value="GENERAL_CARGO">
                  General Cargo
                </option>
                <option value="DUMP_TRUCK">
                  Dump Truck
                </option>
                <option value="TANKER">
                  Tanker
                </option>
                <option value="TRAILER">
                  Trailer
                </option>
              </select>
            </Field>
          ) : null}

          {segment === "TRUCK" &&
          truckCategory === "GENERAL_CARGO" ? (
            <Field label="Spesifik Cargo *">
              <select
                value={specificType}
                onChange={(event) =>
                  setSpecificType(
                    event.target.value
                  )
                }
                className="input"
                required
              >
                <option value="">
                  Pilih spesifik cargo
                </option>

                {cargoOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              {specificType === "OTHER" ? (
                <input
                  value={otherSpecificType}
                  onChange={(event) =>
                    setOtherSpecificType(
                      event.target.value
                    )
                  }
                  placeholder="Tulis jenis cargo"
                  className="input mt-2"
                  required
                />
              ) : null}
            </Field>
          ) : null}

          {segment === "TRUCK" &&
          truckCategory === "TANKER" ? (
            <Field label="Spesifik Tanker *">
              <select
                value={specificType}
                onChange={(event) =>
                  setSpecificType(
                    event.target.value
                  )
                }
                className="input"
                required
              >
                <option value="">
                  Pilih spesifik tanker
                </option>

                {tankerOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              {specificType === "OTHER" ? (
                <input
                  value={otherSpecificType}
                  onChange={(event) =>
                    setOtherSpecificType(
                      event.target.value
                    )
                  }
                  placeholder="Tulis jenis tanker"
                  className="input mt-2"
                  required
                />
              ) : null}
            </Field>
          ) : null}

          <Field label="Nama Fleet / Perusahaan">
            <input
              value={companyName}
              onChange={(event) =>
                setCompanyName(
                  event.target.value
                )
              }
              placeholder="Contoh: JNE / PO Haryanto"
              className="input"
            />
          </Field>

          <Field label="Merk Kendaraan *">
            <select
              value={vehicleBrandId}
              onChange={(event) => {
                setVehicleBrandId(
                  event.target.value
                );

                if (
                  event.target.value !== "OTHER"
                ) {
                  setVehicleBrandOther("");
                }
              }}
              className="input"
              required
            >
              <option value="">
                Pilih merk kendaraan
              </option>

              {vehicleBrands.map((brand) => (
                <option
                  key={brand.id}
                  value={brand.id}
                >
                  {brand.name}
                </option>
              ))}

              <option value="OTHER">
                Lainnya
              </option>
            </select>

            {vehicleBrandId === "OTHER" ? (
              <input
                value={vehicleBrandOther}
                onChange={(event) =>
                  setVehicleBrandOther(
                    event.target.value
                  )
                }
                placeholder="Tulis merk kendaraan"
                className="input mt-2"
                required
              />
            ) : null}
          </Field>

          <Field label="Jenis Muatan">
            <select
              value={cargoType}
              onChange={(event) =>
                setCargoType(
                  event.target.value
                )
              }
              className="input"
            >
              <option value="">
                Pilih jenis muatan
              </option>

              {cargoTypeOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>

            {cargoType === "OTHER" ? (
              <input
                value={otherCargo}
                onChange={(event) =>
                  setOtherCargo(
                    event.target.value
                  )
                }
                placeholder="Tulis jenis muatan"
                className="input mt-2"
                required
              />
            ) : null}
          </Field>
        </div>
      </section>

      <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <SectionTitle
          number="04"
          title="Konfigurasi Poros & Ban"
        />

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ["STEER", "Steer"],
              ["DRIVE", "Drive"],
              ["FREE_ROLLING", "Free Rolling"],
            ] as Array<[AxleType, string]>).map(([axleType, label]) => {
              const config = axleState.find(
                (item) => item.axle_type === axleType
              )!;

              const freeRollingDisabled =
                axleType === "FREE_ROLLING" && baseAxleNumber < 3;
              const maxAllowedByTotal = Math.max(
                0,
                6 -
                  axleState
                    .filter((item) => item.axle_type !== axleType)
                    .reduce((sum, item) => sum + item.axle_count, 0)
              );
              const maxCount =
                axleType === "FREE_ROLLING" ? 5 : 2;
              const options = Array.from(
                { length: Math.min(maxCount, maxAllowedByTotal) + 1 },
                (_, index) => index
              );

              return (
                <div key={axleType} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">
                      {label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {config.axle_count *
                        2 *
                        (config.tire_configuration === "DOUBLE" ? 2 : 1)} ban
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Jumlah Poros">
                      <select
                        value={config.axle_count}
                        disabled={freeRollingDisabled}
                        onChange={(event) =>
                          updateAxleState(axleType, {
                            axle_count: Number(event.target.value),
                          })
                        }
                        className="input"
                      >
                        {options.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Konfigurasi Ban">
                      <select
                        value={config.tire_configuration}
                        disabled={
                          axleType === "STEER" || freeRollingDisabled
                        }
                        onChange={(event) =>
                          updateAxleState(axleType, {
                            tire_configuration: event.target
                              .value as TireConfiguration,
                          })
                        }
                        className="input"
                      >
                        <option value="SINGLE">Single</option>
                        <option value="DOUBLE">Double</option>
                      </select>
                    </Field>
                  </div>

                  {freeRollingDisabled ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Aktif setelah Steer + Drive mencapai minimal 3 poros.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-slate-500">
              Total Poros Terhitung
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalAxleNumber} Poros
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Hasil dari Steer + Drive + Free Rolling
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-blue-600">
              Total Jumlah Ban
            </div>
            <div className="mt-1 text-3xl font-bold leading-none text-blue-700">
              {totalTireCount} Ban
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Dihitung otomatis dari konfigurasi ban.
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs">
          <span className="text-slate-500">
            Status konfigurasi
          </span>

          <span
            className={
              totalAxleNumber === 0
                ? "font-semibold text-slate-500"
                : axleConfigValidation.valid
                  ? "font-semibold text-green-600"
                  : "font-semibold text-red-600"
            }
          >
            {axleConfigValidation.message}
          </span>
        </div>

        {generatedPositions.length > 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-slate-700">
                Posisi ban dibuat otomatis
              </span>
              <span className="font-semibold text-slate-900">
                {generatedPositions.length} posisi
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <PhotoUploadSection
        surveyId={survey.id}
        tirePositions={generatedPositions}
        axleConfigs={axleState}
      />

      {message ? (
        <div className="whitespace-pre-line rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500" aria-live="polite">
          {autoSaveStatus === "saving" ? (
            "Menyimpan draft otomatis..."
          ) : autoSaveStatus === "saved" ? (
            "Draft tersimpan otomatis."
          ) : autoSaveStatus === "error" ? (
            "Draft otomatis gagal disimpan."
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={
              saving ||
              submittingSurvey ||
              Boolean(submittedSerial) ||
              checkingPlate ||
              plateAvailable === false
            }
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : "Simpan Draft"}
          </button>

          <button
            type="button"
            onClick={() => void handleSubmitSurvey()}
            disabled={
              saving ||
              submittingSurvey ||
              Boolean(submittedSerial)
            }
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingSurvey
              ? "Submit..."
              : submittedSerial
                ? `Sudah Submit: ${submittedSerial}`
                : survey.status === "QC_REVISION"
                  ? "Kirim Ulang ke QC"
                  : "Submit Survey"}
          </button>
        </div>
      </div>
    </form>
  );
}


function SectionTitle({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold tracking-widest text-blue-600">
        SECTION {number}
      </p>

      <h2 className="mt-1 text-lg font-semibold text-slate-900">
        {title}
      </h2>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>

      {children}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Field label={label}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
        {value}
      </div>
    </Field>
  );
}

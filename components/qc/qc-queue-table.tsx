"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Assignment = {
  id: string;
  assignment_order: number;
};

type Survey = {
  id: string;
  serial_number: string | null;
  plate_number: string;
  survey_date: string;
  status: string;
};

type QueueItem = {
  assignment: Assignment;
  survey: Survey;
};

function statusLabel(status: string) {
  switch (status) {
    case "SUBMITTED":
    case "QC_REVIEW":
      return "Pending QC";
    case "QC_REVISION":
      return "Revisi Supplier";
    case "QC_PASSED":
      return "Lolos QC";
    case "QC_DROPPED":
      return "Drop QC";
    default:
      return status;
  }
}

export function QcQueueTable({ queue }: { queue: QueueItem[] }) {
  const [filter, setFilter] = useState("ALL");
  const filteredQueue = useMemo(() => {
    if (filter === "ALL") return queue;
    if (filter === "PENDING") return queue.filter(({ survey }) => ["SUBMITTED", "QC_REVIEW"].includes(survey.status));
    if (filter === "PASS") return queue.filter(({ survey }) => survey.status === "QC_PASSED");
    if (filter === "DROP") return queue.filter(({ survey }) => survey.status === "QC_DROPPED");
    return queue;
  }, [filter, queue]);

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Daftar Assignment</h2>
          <p className="mt-1 text-xs text-slate-500">Filter berdasarkan status pekerjaan QC.</p>
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="ALL">Semua</option>
          <option value="PENDING">Pending</option>
          <option value="PASS">Pass</option>
          <option value="DROP">Drop</option>
        </select>
      </div>

      {filteredQueue.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500">
          Tidak ada assignment pada filter ini.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Urutan</th>
                <th className="px-5 py-3 font-medium">Serial Number</th>
                <th className="px-5 py-3 font-medium">Plat Nomor</th>
                <th className="px-5 py-3 font-medium">Tanggal Survey</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQueue.map(({ assignment, survey }) => (
                <tr key={assignment.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{assignment.assignment_order}</td>
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{survey.serial_number ?? "-"}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-700">{survey.plate_number || "-"}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{survey.survey_date}</td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {statusLabel(survey.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <Link
                      href={`/qc/${survey.id}`}
                      className="inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      {survey.status === "SUBMITTED" || survey.status === "QC_REVIEW" ? "Buka QC" : "Lihat"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileDown, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, FilterBar, FilterSelect, SectionCard, SearchBox, SimpleSelect, downloadCSV } from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import { formatCourseDuration, SEED_DEPARTMENTS } from "@/finance/courses";
import type { Course, CourseChange, CourseDurationUnit } from "@/finance/types";

const UNITS: CourseDurationUnit[] = ["days", "months", "years"];
const STATUS_OPTIONS = ["Active", "Inactive"];
const money = (fee?: number) => fee === undefined ? "Not set" : `₹${fee.toLocaleString("en-IN")}`;

export function CourseCatalogTab() {
  const { courseCatalog, setCourseCatalog, students } = useFinance();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [editingCourse, setEditingCourse] = useState<Course | null | undefined>(undefined);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => courseCatalog.courses.filter((course) =>
    (statusFilter === "all" || course.status === statusFilter) &&
    (departmentFilter === "all" || course.department === departmentFilter) &&
    (!query || course.name.toLowerCase().includes(query.toLowerCase()))),
  [courseCatalog.courses, statusFilter, departmentFilter, query]);

  const addDepartment = () => {
    const name = window.prompt("Department name")?.trim();
    if (!name) return;
    if (!SEED_DEPARTMENTS.includes(name)) { toast.error(`Use one of the six configured departments: ${SEED_DEPARTMENTS.join(", ")}`); return; }
    if (courseCatalog.departments.some((d) => d.toLowerCase() === name.toLowerCase())) { toast.error("Department already exists"); return; }
    setCourseCatalog((current) => ({ ...current, departments: [...current.departments, name] }));
  };
  const renameDepartment = (department: string) => {
    const name = window.prompt("Rename department", department)?.trim();
    if (!name || name === department) return;
    if (!SEED_DEPARTMENTS.includes(name)) { toast.error(`Department names are limited to: ${SEED_DEPARTMENTS.join(", ")}`); return; }
    if (courseCatalog.departments.some((d) => d.toLowerCase() === name.toLowerCase())) { toast.error("Department already exists"); return; }
    toast.error("All six configured departments are already in use; choose a course department in Edit course instead.");
  };

  const updateCourse = (nextCourse: Course) => {
    setCourseCatalog((current) => {
      const old = current.courses.find((course) => course.id === nextCourse.id);
      if (!old) return { ...current, courses: [...current.courses, nextCourse] };
      const changedAt = new Date().toISOString();
      const changes: Pick<CourseChange, "field" | "oldValue" | "newValue">[] = [];
      if (old.department !== nextCourse.department) changes.push({ field: "Department", oldValue: old.department, newValue: nextCourse.department });
      if (old.fee !== nextCourse.fee) changes.push({ field: "Fee", oldValue: money(old.fee), newValue: money(nextCourse.fee) });
      if (JSON.stringify([old.fastTrack, old.normalTrack]) !== JSON.stringify([nextCourse.fastTrack, nextCourse.normalTrack])) {
        changes.push({ field: "Duration", oldValue: `Fast ${formatCourseDuration(old.fastTrack)} / Normal ${formatCourseDuration(old.normalTrack)}`, newValue: `Fast ${formatCourseDuration(nextCourse.fastTrack)} / Normal ${formatCourseDuration(nextCourse.normalTrack)}` });
      }
      if (old.status !== nextCourse.status) changes.push({ field: "Status", oldValue: old.status, newValue: nextCourse.status });
      return {
        ...current,
        courses: current.courses.map((course) => course.id === nextCourse.id ? nextCourse : course),
        history: [...changes.map((change) => ({
          id: `${nextCourse.id}-${changedAt}-${change.field}`,
          courseId: nextCourse.id,
          courseName: nextCourse.name,
          ...change,
          changedBy: "Admin/Owner",
          changedAt,
        })), ...current.history],
      };
    });
  };

  const addCourse = (course: Omit<Course, "id" | "serialNumber">) => {
    setCourseCatalog((current) => {
      const serialNumber = Math.max(0, ...current.courses.map((item) => item.serialNumber)) + 1;
      return { ...current, courses: [...current.courses, { ...course, id: `COURSE-${Date.now()}-${serialNumber}`, serialNumber }] };
    });
    toast.success("Course added");
  };

  const saveFee = (course: Course) => {
    const raw = feeDrafts[course.id] ?? (course.fee === undefined ? "" : String(course.fee));
    const fee = raw.trim() === "" ? undefined : Number(raw);
    if (fee !== undefined && (!Number.isFinite(fee) || fee < 0)) { toast.error("Course fee must be a non-negative number"); return; }
    updateCourse({ ...course, fee });
    setFeeDrafts((current) => { const copy = { ...current }; delete copy[course.id]; return copy; });
    toast.success("Course fee saved");
  };

  const removeCourse = (course: Course) => {
    const used = students.some((student) => student.courseId === course.id || (!student.courseId && student.course === course.name));
    if (used) { toast.error("This course is used by a student. Mark it inactive instead."); return; }
    if (!window.confirm(`Delete ${course.name}?`)) return;
    setCourseCatalog((current) => ({ ...current, courses: current.courses.filter((item) => item.id !== course.id) }));
    toast.success("Course deleted");
  };

  const exportRows = courseCatalog.courses.map((course) => [
    course.serialNumber, course.department, course.name, course.fee ?? "Not set",
    formatCourseDuration(course.fastTrack), formatCourseDuration(course.normalTrack), course.status,
  ]);

  return (
    <div className="print-area course-catalog-print space-y-4">
      <SectionCard title="Course Catalog & Fee Structure" action={(
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCSV("course-catalog", ["Sl. No.", "Department", "Course Name", "Course Fee", "Fast Track", "Normal Track", "Status"], exportRows)}>
            <Download className="mr-1 h-4 w-4" />Export Excel (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><FileDown className="mr-1 h-4 w-4" />Export PDF</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
          <Button variant="outline" size="sm" onClick={addDepartment}><Plus className="mr-1 h-4 w-4" />Add department</Button>
          <Button size="sm" onClick={() => setEditingCourse(null)}><Plus className="mr-1 h-4 w-4" />Add course</Button>
        </div>
      )}>
        <FilterBar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search course name" />
          <FilterSelect label="Department" value={departmentFilter} onChange={setDepartmentFilter} options={courseCatalog.departments} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
        </FilterBar>
        <div className="space-y-2">
          {courseCatalog.departments.filter((department) => departmentFilter === "all" || departmentFilter === department).map((department) => {
            const departmentCourses = filtered.filter((course) => course.department === department).sort((a, b) => a.serialNumber - b.serialNumber);
            return <details key={department} className="overflow-hidden rounded-md border">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-muted/40 px-3 py-2 font-medium">{department} ({departmentCourses.length})<Button type="button" size="sm" variant="ghost" onClick={(event) => { event.preventDefault(); renameDepartment(department); }}>Rename department</Button></summary>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Sl. No.</TableHead><TableHead>Course Name</TableHead><TableHead>Course Fee</TableHead>
                    <TableHead>Fast Track</TableHead><TableHead>Normal Track</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{departmentCourses.map((course) => {
                      const used = students.some((student) => student.courseId === course.id || (!student.courseId && student.course === course.name));
                      return (
                        <TableRow key={course.id}>
                          <TableCell className="num">{course.serialNumber}</TableCell>
                          <TableCell className="font-medium">{course.name}</TableCell>
                          <TableCell>
                            {course.department === "UG & PG" ? <span className="text-muted-foreground">Not set</span> : <div className="flex min-w-[180px] items-center gap-1">
                              <Input aria-label={`Course fee for ${course.name}`} type="number" min="0" step="0.01" className="h-8 w-28"
                                placeholder="Not set" value={feeDrafts[course.id] ?? (course.fee === undefined ? "" : String(course.fee))}
                                onChange={(event) => setFeeDrafts((current) => ({ ...current, [course.id]: event.target.value }))} />
                              <Button variant="outline" size="sm" onClick={() => saveFee(course)}>Save</Button>
                            </div>}
                          </TableCell>
                          <TableCell>{formatCourseDuration(course.fastTrack)}</TableCell>
                          <TableCell>{formatCourseDuration(course.normalTrack)}</TableCell>
                          <TableCell>{course.status}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setEditingCourse(course)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                              <Button variant="outline" size="sm" onClick={() => updateCourse({ ...course, status: course.status === "Active" ? "Inactive" : "Active" })}>
                                {course.status === "Active" ? "Mark inactive" : "Activate"}
                              </Button>
                              {used ? <span title="In use by students. Mark inactive instead." className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground"><Trash2 className="h-4 w-4 opacity-40" /></span> : <Button variant="ghost" size="icon" aria-label={`Delete ${course.name}`} onClick={() => removeCourse(course)}><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                  })}</TableBody>
                </Table>
              </div>
            </details>;
          })}
        </div>
      </SectionCard>

      <SectionCard title="Course change history">
        {courseCatalog.history.length === 0 ? <p className="text-sm text-muted-foreground">No fee, duration or status changes yet.</p> : (
          <Table><TableHeader><TableRow>
            <TableHead>Date and time</TableHead><TableHead>Course</TableHead><TableHead>Change</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead><TableHead>Changed by</TableHead>
          </TableRow></TableHeader><TableBody>
            {courseCatalog.history.map((change) => (
              <TableRow key={change.id}>
                <TableCell className="whitespace-nowrap">{new Date(change.changedAt).toLocaleString("en-IN")}</TableCell>
                <TableCell>{change.courseName}</TableCell><TableCell>{change.field}</TableCell>
                <TableCell>{change.oldValue}</TableCell><TableCell>{change.newValue}</TableCell><TableCell>{change.changedBy}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        )}
      </SectionCard>

      {editingCourse !== undefined && <CourseDialog
        course={editingCourse ?? undefined}
        departments={courseCatalog.departments}
        onClose={() => setEditingCourse(undefined)}
        onSave={(course) => {
          if (editingCourse) { updateCourse({ ...editingCourse, ...course }); toast.success("Course updated"); }
          else addCourse(course);
          setEditingCourse(undefined);
        }}
        existing={courseCatalog.courses}
      />}
    </div>
  );
}

function CourseDialog({ course, existing, departments, onSave, onClose }: {
  course: Course | undefined;
  existing: Course[];
  departments: string[];
  onSave: (course: Omit<Course, "id" | "serialNumber">) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(course?.name ?? "");
  const [department, setDepartment] = useState(course?.department ?? departments[0] ?? "");
  const [fee, setFee] = useState(course?.fee === undefined ? "" : String(course.fee));
  const [fastValue, setFastValue] = useState(String(course?.fastTrack.value ?? 1));
  const [fastUnit, setFastUnit] = useState<CourseDurationUnit>(course?.fastTrack.unit ?? "months");
  const [normalValue, setNormalValue] = useState(course?.normalTrack ? String(course.normalTrack.value) : "2");
  const [normalUnit, setNormalUnit] = useState<CourseDurationUnit>(course?.normalTrack?.unit ?? "months");
  const [normalEnabled, setNormalEnabled] = useState(!!course?.normalTrack);
  const [status, setStatus] = useState<Course["status"]>(course?.status ?? "Active");
  const [error, setError] = useState("");
  const feeAndNormalTrackDisabled = department === "UG & PG";

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) { setError("Course name is required."); return; }
    if (existing.some((item) => item.name.toLowerCase() === cleanName.toLowerCase() && item.id !== course?.id)) {
      setError("Course name must be unique."); return;
    }
    const feeNumber = fee.trim() === "" ? undefined : Number(fee);
    if (feeNumber !== undefined && (!Number.isFinite(feeNumber) || feeNumber < 0)) { setError("Course fee must be a non-negative number."); return; }
    const fastNumber = Number(fastValue);
    const normalNumber = Number(normalValue);
    if (!Number.isFinite(fastNumber) || fastNumber <= 0 || (normalEnabled && (!Number.isFinite(normalNumber) || normalNumber <= 0))) {
      setError("Track durations must be valid positive numbers."); return;
    }
    setError("");
    onSave({
      name: cleanName, department, fee: feeAndNormalTrackDisabled ? undefined : feeNumber,
      fastTrack: { value: fastNumber, unit: fastUnit },
      normalTrack: !feeAndNormalTrackDisabled && normalEnabled ? { value: normalNumber, unit: normalUnit } : undefined,
      status,
    } as Omit<Course, "id" | "serialNumber">);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{course ? "Edit course" : "Add course"}</DialogTitle></DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course name" htmlFor="course-name"><Input id="course-name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Department" htmlFor="course-department"><SimpleSelect id="course-department" value={department} onChange={setDepartment} options={departments} /></Field>
            <Field label="Course fee (₹, optional)" htmlFor="course-fee"><Input id="course-fee" type="number" min="0" step="0.01" value={feeAndNormalTrackDisabled ? "" : fee} onChange={(event) => setFee(event.target.value)} placeholder="Not set" disabled={feeAndNormalTrackDisabled} /></Field>
            <Field label="Status" htmlFor="course-status"><SimpleSelect id="course-status" value={status} onChange={(value) => setStatus(value as Course["status"])} options={STATUS_OPTIONS} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fast track duration" htmlFor="fast-duration"><Input id="fast-duration" type="number" min="1" value={fastValue} onChange={(event) => setFastValue(event.target.value)} /></Field>
              <Field label="Unit" htmlFor="fast-unit"><SimpleSelect id="fast-unit" value={fastUnit} onChange={(value) => setFastUnit(value as CourseDurationUnit)} options={UNITS} /></Field>
            </div>
            <div className="space-y-2">
              {!feeAndNormalTrackDisabled && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={normalEnabled} onChange={(event) => setNormalEnabled(event.target.checked)} />Normal track available</label>}
              {!feeAndNormalTrackDisabled && normalEnabled && <div className="grid grid-cols-2 gap-2">
                <Field label="Normal track duration" htmlFor="normal-duration"><Input id="normal-duration" type="number" min="1" value={normalValue} onChange={(event) => setNormalValue(event.target.value)} /></Field>
                <Field label="Unit" htmlFor="normal-unit"><SimpleSelect id="normal-unit" value={normalUnit} onChange={(value) => setNormalUnit(value as CourseDurationUnit)} options={UNITS} /></Field>
              </div>}
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
          <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save course</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

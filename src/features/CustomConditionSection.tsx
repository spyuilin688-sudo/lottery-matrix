import { Fragment, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { customRoadTypes as ROAD_TYPES, defaultCustomRow, oneCodeStreaks, twoCodeStreaks, type CustomConditionGroup, type CustomConditionRow, type CustomRoadType } from "../../shared/matrix-status-config";

const streakLabel = (n: number) => "準" + n + "進" + (n + 1);

function ConditionGroupPanel({ title, number, group, initiallyOpen, disabled, onRemove, children }: {
  title: string; number: number; group: CustomConditionGroup; initiallyOpen: boolean;
  disabled: boolean; onRemove(): void; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const condition = group.rows[0];
  const streak = condition && (condition.consecutiveMin === condition.consecutiveMax
    ? streakLabel(condition.consecutiveMin)
    : streakLabel(condition.consecutiveMin) + "～" + streakLabel(condition.consecutiveMax));
  const quantity = condition && (Number.isFinite(condition.sameCodeMin) ? condition.sameCodeMin : "—")
    + (condition?.sameCodeMin === condition?.sameCodeMax ? "" : "～" + (condition?.sameCodeMax ?? "不限"));

  return <article className="custom-status-group" aria-label={title + " 條件群組 " + number}>
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="custom-status-group-toggle">
        <h3>條件群組 {number}</h3>
        <span className="custom-status-group-preview">{group.rows.length === 1
          ? <><span>{streak}</span><span>同碼 {quantity}</span></>
          : <span>{group.rows.length} 項條件同時符合</span>}</span>
        <ChevronDownIcon aria-hidden="true" />
      </summary>
      <div className="custom-status-group-body">{children}</div>
    </details>
    <button type="button" disabled={disabled} className="custom-status-remove"
      aria-label={title + " 刪除條件群組 " + number} onClick={onRemove}><TrashIcon aria-hidden="true" /></button>
  </article>;
}
type Props = {
  hitType: "one" | "two"; groups: CustomConditionGroup[];
  setGroups: Dispatch<SetStateAction<CustomConditionGroup[]>>;
  compositeEnabled: boolean; disabled: boolean; errorPath?: string; modeLabel?: string;
};

export function CustomConditionSection({ hitType, groups, setGroups, compositeEnabled, disabled, errorPath, modeLabel }: Props) {
  const [newGroupId, setNewGroupId] = useState<string>();
  const title = hitType === "one" ? "一碼條件" : "兩碼條件";
  const root = hitType === "one" ? "oneCodeGroups" : "twoCodeGroups";
  const streaks = hitType === "one" ? oneCodeStreaks : twoCodeStreaks;
  const updateRow = (groupIndex: number, rowIndex: number, patch: Partial<CustomConditionRow>) =>
    setGroups(current => current.map((group, i) => i === groupIndex
      ? { ...group, rows: group.rows.map((row, j) => j === rowIndex ? { ...row, ...patch } : row) }
      : group));
  const validity = (path: string) => ({
    "data-field-path": path,
    "aria-invalid": errorPath === path || undefined,
    "aria-describedby": errorPath === path ? "custom-status-error" : undefined,
  });
  return <section className="custom-status-hit-section" aria-label={title}>
    <header className="custom-status-section-heading">
      <h2 className="custom-status-section-title">{title}</h2>
      {modeLabel ? <p className="custom-status-default-mode" role="status">{modeLabel}</p> : null}
    </header>
    <div className="custom-status-groups">
      {groups.map((group, groupIndex) => <Fragment key={group.id}>
        {groupIndex > 0 ? <p className="custom-status-or">或</p> : null}
        <ConditionGroupPanel title={title} number={groupIndex + 1} group={group}
          initiallyOpen={group.id === newGroupId} disabled={disabled}
          onRemove={() => setGroups(current => current.filter(item => item.id !== group.id))}>
          {group.rows.map((condition, rowIndex) => {
            const prefix = hitType + "-" + group.id + "-" + rowIndex;
            const path = root + "." + groupIndex + ".rows." + rowIndex;
            const sets = condition.roadTypeAlternatives ?? [condition.roadTypes];
            const toggleRoad = (setIndex: number, road: CustomRoadType, checked: boolean) => {
              const nextSets = sets.map((set, i) => i === setIndex
                ? ROAD_TYPES.filter(type => type === road ? checked : set.includes(type)) : set);
              updateRow(groupIndex, rowIndex, {
                roadTypes: ROAD_TYPES.filter(type => nextSets.some(set => set.includes(type))),
                ...(condition.roadTypeAlternatives ? { roadTypeAlternatives: nextSets } : {}),
              });
            };
            return <Fragment key={rowIndex}>
              {rowIndex > 0 ? <p className="custom-status-and">＋ 同時符合</p> : null}
              <fieldset className="custom-status-condition-row" aria-label={"條件 " + (rowIndex + 1)} disabled={disabled}>
                {group.rows.length > 1 ? <legend>條件 {rowIndex + 1}</legend> : null}
                <div className="custom-status-field custom-status-field--roads">
                  <span id={prefix + "-roads-label"} className="custom-status-field-label">版路</span>
                  <div className="custom-status-road-sets" role="group" aria-labelledby={prefix + "-roads-label"} tabIndex={-1}
                    {...validity(path + ".roadTypes")}>
                    {sets.map((set, setIndex) => <Fragment key={setIndex}>
                      {setIndex > 0 ? <span className="custom-status-road-or">或</span> : null}
                      <div className="segmented custom-status-road-options" role="group" aria-label={"版路組合 " + (setIndex + 1)}>
                        {ROAD_TYPES.map(road => <label className="segmented-static" data-selected={set.includes(road)} key={road}>
                          <input type="checkbox" checked={set.includes(road)}
                            disabled={disabled || (road === "複合" && !compositeEnabled && !set.includes(road))}
                            onChange={event => toggleRoad(setIndex, road, event.target.checked)} />
                          <span>{road}</span>
                        </label>)}
                      </div>
                    </Fragment>)}
                  </div>
                </div>
                <label className="custom-status-field" htmlFor={prefix + "-relation"}>
                  <span className="custom-status-field-label">版路關係</span>
                  <select id={prefix + "-relation"} aria-label="版路關係" value={condition.roadRelation}
                    {...validity(path + ".roadRelation")}
                    onChange={event => updateRow(groupIndex, rowIndex, {
                      roadRelation: event.target.value as "any" | "all",
                      ...(event.target.value === "any" ? { roadTypeAlternatives: undefined } : {}),
                    })}>
                    <option value="any">任一版路符合</option><option value="all">指定版路皆須存在</option>
                  </select>
                </label>
                <div className="custom-status-field">
                  <span className="custom-status-field-label">連準範圍</span>
                  <div className="custom-status-range">
                    <label><span>起點</span><select aria-label="連準起點" value={condition.consecutiveMin}
                      {...validity(path + ".consecutiveMin")}
                      onChange={event => updateRow(groupIndex, rowIndex, { consecutiveMin: Number(event.target.value) })}>
                      {streaks.map(streak => <option value={streak} key={streak}>{streakLabel(streak)}</option>)}
                    </select></label>
                    <span className="custom-status-range-divider">～</span>
                    <label><span>終點</span><select aria-label="連準終點" value={condition.consecutiveMax}
                      {...validity(path + ".consecutiveMax")}
                      onChange={event => updateRow(groupIndex, rowIndex, { consecutiveMax: Number(event.target.value) })}>
                      {streaks.map(streak => <option value={streak} key={streak}>{streakLabel(streak)}</option>)}
                    </select></label>
                    <output className="custom-status-range-summary">{condition.consecutiveMin === condition.consecutiveMax
                      ? streakLabel(condition.consecutiveMin) : streakLabel(condition.consecutiveMin) + " ～ " + streakLabel(condition.consecutiveMax)}</output>
                  </div>
                </div>
                <div className="custom-status-field">
                  <span className="custom-status-field-label">同碼條數</span>
                  <div className="custom-status-range">
                    <label><span>最少</span><input aria-label="最少" type="number" inputMode="numeric" min={1} max={99} step={1}
                      value={Number.isFinite(condition.sameCodeMin) ? condition.sameCodeMin : ""}
                      {...validity(path + ".sameCodeMin")}
                      onChange={event => updateRow(groupIndex, rowIndex, { sameCodeMin: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></label>
                    <span className="custom-status-range-divider">～</span>
                    <label><span>最多</span><input aria-label="最多" type="number" inputMode="numeric" min={1} max={99} step={1}
                      placeholder="不限" value={condition.sameCodeMax ?? ""}
                      {...validity(path + ".sameCodeMax")}
                      onChange={event => updateRow(groupIndex, rowIndex, { sameCodeMax: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  </div>
                </div>
                <label className="custom-status-field" htmlFor={prefix + "-order"}>
                  <span className="custom-status-field-label">號碼排序</span>
                  <select aria-label="號碼排序" id={prefix + "-order"} value={condition.numberOrder}
                    {...validity(path + ".numberOrder")}
                    onChange={event => updateRow(groupIndex, rowIndex, { numberOrder: event.target.value as CustomConditionRow["numberOrder"] })}>
                    <option value="依號碼由小到大排序">依號碼由小到大</option>
                    <option value="依實際開獎順序排序">依實際開獎順序</option>
                  </select>
                </label>
                {group.rows.length > 1 ? <button type="button" className="custom-status-remove-row"
                  aria-label={title + " 條件群組 " + (groupIndex + 1) + " 刪除條件 " + (rowIndex + 1)}
                  onClick={() => setGroups(current => current.map((item, i) => i === groupIndex
                    ? { ...item, rows: item.rows.filter((_, j) => j !== rowIndex) } : item))}><TrashIcon />刪除條件</button> : null}
              </fieldset>
            </Fragment>;
          })}
          <button type="button" className="custom-status-add-button custom-status-add-row"
            disabled={disabled || group.rows.length >= 10}
            aria-label={title + " 條件群組 " + (groupIndex + 1) + " 新增同時符合條件"}
            onClick={() => setGroups(current => current.map(item => item.id === group.id
              ? { ...item, rows: [...item.rows, defaultCustomRow(hitType)] } : item))}><PlusIcon />新增同時符合條件</button>
        </ConditionGroupPanel>
      </Fragment>)}
      <button type="button" className="custom-status-add-button" disabled={disabled || groups.length >= 20}
        aria-label={"新增" + (hitType === "one" ? "一碼" : "兩碼") + "條件群組"}
        onClick={() => {
          const id = hitType + "-" + crypto.randomUUID();
          setNewGroupId(id);
          setGroups(current => [...current, { id, rows: [defaultCustomRow(hitType)] }]);
        }}><PlusIcon />新增條件群組</button>
    </div>
  </section>;
}

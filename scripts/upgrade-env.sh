#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_MODE="all"

log() {
  printf '==> %s\n' "$1"
}

ok() {
  printf '[OK] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1"
}

fail() {
  printf '[ERROR] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：
  bash ./scripts/upgrade-env.sh [--target env|server|all]

说明：
  - 默认同时升级 .env 和 .env.server
  - 只补齐 example 中新增但目标文件缺失的 key
  - 不覆盖目标文件已有值
  - 执行结束后会输出本次新增字段，以及仍需人工补全的新增字段
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target)
        [[ $# -ge 2 ]] || fail "--target 需要一个参数"
        TARGET_MODE="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "未知参数：$1"
        ;;
    esac
  done

  case "${TARGET_MODE}" in
    env|server|all) ;;
    *)
      fail "--target 仅支持 env、server 或 all"
      ;;
  esac
}

normalize_file() {
  local path="$1"
  local temp_path="${path}.tmp"
  awk '{ sub(/\r$/, ""); print }' "${path}" > "${temp_path}"
  mv "${temp_path}" "${path}"
}

contains_key() {
  local path="$1"
  local key="$2"
  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || continue
    if [[ "${line%%=*}" == "${key}" ]]; then
      return 0
    fi
  done < "${path}"
  return 1
}

placeholder_value() {
  local value="$1"
  local lower="${value,,}"
  if [[ -z "${value}" ]]; then
    return 0
  fi
  case "${lower}" in
    password|local|changeme)
      return 0
      ;;
  esac
  if [[ "${value}" == your_* || "${value}" == YOUR_* ]]; then
    return 0
  fi
  return 1
}

# example 文件中的 section 由“连续注释块 + 连续配置项”组成。
# 这里拆成临时文件，便于后面按 section 粒度把缺失项插回目标 env。
build_example_sections() {
  local example_path="$1"
  local section_dir="$2"
  local manifest_path="$3"
  local index=0

  mkdir -p "${section_dir}"
  : > "${manifest_path}"

  local -a comments=()
  local -a entries=()

  flush_section() {
    if [[ "${#entries[@]}" -eq 0 ]]; then
      comments=()
      return 0
    fi

    index=$((index + 1))
    local section_path="${section_dir}/section-${index}.txt"
    : > "${section_path}"

    local line
    for line in "${comments[@]}"; do
      printf '%s\n' "${line}" >> "${section_path}"
    done
    for line in "${entries[@]}"; do
      printf '%s\n' "${line}" >> "${section_path}"
    done

    local anchor=""
    if [[ "${#comments[@]}" -gt 0 ]]; then
      anchor="${comments[0]}"
    fi
    printf '%s|%s\n' "${section_path}" "${anchor}" >> "${manifest_path}"

    comments=()
    entries=()
  }

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    if [[ "${line}" == \#* ]]; then
      if [[ "${#entries[@]}" -gt 0 ]]; then
        flush_section
      fi
      comments+=("${line}")
      continue
    fi
    if [[ "${line}" == *=* ]]; then
      entries+=("${line}")
      continue
    fi
    if [[ -z "${line}" && "${#entries[@]}" -gt 0 ]]; then
      flush_section
    fi
  done < "${example_path}"

  flush_section
}

collect_keys_from_file() {
  local source_path="$1"
  local added_list_path="$2"
  local needs_fill_path="$3"

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || continue
    local key="${line%%=*}"
    local value="${line#*=}"
    printf '%s\n' "${key}" >> "${added_list_path}"
    if placeholder_value "${value}"; then
      printf '%s\n' "${key}" >> "${needs_fill_path}"
    fi
  done < "${source_path}"
}

build_missing_blocks() {
  local section_path="$1"
  local target_path="$2"
  local keys_block_path="$3"
  local section_block_path="$4"
  local added_list_path="$5"
  local needs_fill_path="$6"

  local -a comments=()
  local -a missing_entries=()
  local seen_entry=0

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    if [[ "${seen_entry}" -eq 0 && "${line}" == \#* ]]; then
      comments+=("${line}")
      continue
    fi
    if [[ "${line}" == *=* ]]; then
      seen_entry=1
      local key="${line%%=*}"
      local value="${line#*=}"
      if ! contains_key "${target_path}" "${key}"; then
        missing_entries+=("${line}")
        printf '%s\n' "${key}" >> "${added_list_path}"
        if placeholder_value "${value}"; then
          printf '%s\n' "${key}" >> "${needs_fill_path}"
        fi
      fi
    fi
  done < "${section_path}"

  if [[ "${#missing_entries[@]}" -eq 0 ]]; then
    return 1
  fi

  : > "${keys_block_path}"
  : > "${section_block_path}"

  local line
  for line in "${missing_entries[@]}"; do
    printf '%s\n' "${line}" >> "${keys_block_path}"
  done
  for line in "${comments[@]}"; do
    printf '%s\n' "${line}" >> "${section_block_path}"
  done
  for line in "${missing_entries[@]}"; do
    printf '%s\n' "${line}" >> "${section_block_path}"
  done

  return 0
}

find_insert_line_for_anchor() {
  local target_path="$1"
  local anchor="$2"
  awk -v anchor="${anchor}" '
    function is_assignment(line) {
      return line !~ /^#/ && index(line, "=") > 0
    }
    {
      line = $0
      sub(/\r$/, "", line)
      if (!started) {
        if (line == anchor) {
          started = 1
        }
        next
      }
      if (is_assignment(line)) {
        saw_assignment = 1
        next
      }
      if (saw_assignment && (line == "" || line ~ /^#/)) {
        found = 1
        print NR
        exit
      }
    }
    END {
      if (started && !found) {
        print NR + 1
      }
    }
  ' "${target_path}"
}

insert_keys_before_line() {
  local target_path="$1"
  local keys_block_path="$2"
  local insert_line="$3"
  local temp_path="${target_path}.tmp"

  awk -v insert_line="${insert_line}" -v insert_file="${keys_block_path}" '
    BEGIN {
      while ((getline line < insert_file) > 0) {
        inserts[++insert_count] = line
      }
      close(insert_file)
    }
    {
      line = $0
      sub(/\r$/, "", line)
      if (NR == insert_line) {
        for (i = 1; i <= insert_count; i++) {
          print inserts[i]
        }
      }
      print line
    }
    END {
      if (insert_line == NR + 1) {
        for (i = 1; i <= insert_count; i++) {
          print inserts[i]
        }
      }
    }
  ' "${target_path}" > "${temp_path}"

  mv "${temp_path}" "${target_path}"
}

append_section_block() {
  local target_path="$1"
  local section_block_path="$2"
  local temp_path="${target_path}.tmp"

  awk -v block_file="${section_block_path}" '
    BEGIN {
      while ((getline line < block_file) > 0) {
        block[++block_count] = line
      }
      close(block_file)
    }
    {
      current = $0
      sub(/\r$/, "", current)
      print current
      last = current
    }
    END {
      if (NR > 0 && last != "") {
        print ""
      }
      for (i = 1; i <= block_count; i++) {
        print block[i]
      }
    }
  ' "${target_path}" > "${temp_path}"

  mv "${temp_path}" "${target_path}"
}

print_summary() {
  local label="$1"
  local added_list_path="$2"
  local needs_fill_path="$3"

  if [[ ! -s "${added_list_path}" ]]; then
    ok "${label} 无新增配置"
  else
    ok "${label} 新增配置："
    awk '!seen[$0]++ { printf "  - %s\n", $0 }' "${added_list_path}"
  fi

  if [[ ! -s "${needs_fill_path}" ]]; then
    ok "${label} 本次新增字段无需额外补全"
  else
    warn "${label} 以下新增字段仍需人工补全："
    awk '!seen[$0]++ { printf "  - %s\n", $0 }' "${needs_fill_path}"
  fi
}

process_pair() {
  local label="$1"
  local example_path="$2"
  local target_path="$3"

  [[ -f "${example_path}" ]] || fail "找不到模板文件：${example_path}"

  log "升级 ${label} 配置"

  local created_target=0
  if [[ ! -f "${target_path}" ]]; then
    cp "${example_path}" "${target_path}"
    created_target=1
    ok "已根据模板创建 ${target_path}"
  fi

  normalize_file "${example_path}"
  normalize_file "${target_path}"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf \"${tmp_dir}\"" RETURN

  local added_list_path="${tmp_dir}/added-keys.txt"
  local needs_fill_path="${tmp_dir}/needs-fill.txt"
  : > "${added_list_path}"
  : > "${needs_fill_path}"

  if [[ "${created_target}" -eq 1 ]]; then
    collect_keys_from_file "${example_path}" "${added_list_path}" "${needs_fill_path}"
    print_summary "${label}" "${added_list_path}" "${needs_fill_path}"
    return 0
  fi

  local section_dir="${tmp_dir}/sections"
  local manifest_path="${tmp_dir}/sections.manifest"
  build_example_sections "${example_path}" "${section_dir}" "${manifest_path}"

  while IFS='|' read -r section_path anchor || [[ -n "${section_path:-}" ]]; do
    [[ -n "${section_path}" ]] || continue

    local keys_block_path="${tmp_dir}/missing-keys.txt"
    local section_block_path="${tmp_dir}/missing-section.txt"
    : > "${keys_block_path}"
    : > "${section_block_path}"

    if ! build_missing_blocks \
      "${section_path}" \
      "${target_path}" \
      "${keys_block_path}" \
      "${section_block_path}" \
      "${added_list_path}" \
      "${needs_fill_path}"; then
      continue
    fi

    if [[ -n "${anchor}" ]] && grep -Fqx "${anchor}" "${target_path}"; then
      local insert_line
      insert_line="$(find_insert_line_for_anchor "${target_path}" "${anchor}")"
      insert_keys_before_line "${target_path}" "${keys_block_path}" "${insert_line}"
    else
      append_section_block "${target_path}" "${section_block_path}"
    fi
    normalize_file "${target_path}"
  done < "${manifest_path}"

  print_summary "${label}" "${added_list_path}" "${needs_fill_path}"
}

main() {
  parse_args "$@"

  case "${TARGET_MODE}" in
    env)
      process_pair ".env" "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
      ;;
    server)
      process_pair ".env.server" "${REPO_ROOT}/.env.server.example" "${REPO_ROOT}/.env.server"
      ;;
    all)
      process_pair ".env" "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
      process_pair ".env.server" "${REPO_ROOT}/.env.server.example" "${REPO_ROOT}/.env.server"
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

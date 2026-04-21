<template>
  <div v-if="total > 0" class="app-pagination-bar flex justify-end mt-4 flex-wrap gap-y-2">
    <el-pagination
      v-model:current-page="pageModel"
      v-model:page-size="pageSizeModel"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      background
      :disabled="disabled"
      @current-change="() => emit('change')"
      @size-change="onSizeChange"
    />
  </div>
</template>

<script setup>
defineProps({
  total: { type: Number, default: 0 },
  /** 列表同步等场景下禁止翻页 */
  disabled: { type: Boolean, default: false },
})

const pageModel = defineModel('page', { type: Number, default: 1 })
const pageSizeModel = defineModel('pageSize', { type: Number, default: 20 })
const emit = defineEmits(['change'])

function onSizeChange() {
  pageModel.value = 1
  emit('change')
}
</script>

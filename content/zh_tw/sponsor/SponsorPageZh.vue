<script setup lang="ts">
import SponsorOneColumn from './SponsorOneColumnZh.vue'
</script>

<template>
  <SponsorOneColumn
    :sponsor-levels="[
      'titanium',
      'gold',
      'silver',
      'bronze',
      'friend',
      'over-seas',
      'co-promotion-partner',
      'co-host',
      'co-organizer',
      'special-thanks',
    ]"
  />
</template>

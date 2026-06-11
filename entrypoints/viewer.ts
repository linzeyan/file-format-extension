import { defineUnlistedScript } from '#imports'
import { mountViewer } from '../viewer/mount'

// Single IIFE. In later milestones this entry pulls in Shiki + all grammars +
// parsers (all inlined), but it is only ever loaded on actual raw-file pages.
export default defineUnlistedScript(() => {
  void mountViewer()
})

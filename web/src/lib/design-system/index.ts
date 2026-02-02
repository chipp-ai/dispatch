/**
 * Chipp Design System
 *
 * Centralized design system exports for consistent UI development.
 * Import components and utilities from this file.
 */

// CSS (import in main entry point)
export const CSS_IMPORTS = ["./tokens.css", "./base.css"];

// Core components
export { default as Button } from "./components/Button.svelte";
export { default as Card } from "./components/Card.svelte";
export { default as Input } from "./components/Input.svelte";
export { default as ThemeToggle } from "./components/ThemeToggle.svelte";
export { default as Skeleton } from "./components/Skeleton.svelte";
export { default as Spinner } from "./components/Spinner.svelte";
export { default as ApplicationCard } from "./components/ApplicationCard.svelte";
export { default as MarketplaceCard } from "./components/MarketplaceCard.svelte";

// Form components
export { default as Label } from "./components/Label.svelte";
export { default as Textarea } from "./components/Textarea.svelte";
export { default as Checkbox } from "./components/Checkbox.svelte";
export { default as Switch } from "./components/Switch.svelte";
export { default as Slider } from "./components/Slider.svelte";
export { default as RadioGroup } from "./components/RadioGroup.svelte";
export { default as RadioGroupItem } from "./components/RadioGroupItem.svelte";
export { default as Select } from "./components/Select.svelte";
export { default as SelectItem } from "./components/SelectItem.svelte";

// Display components
export { default as Avatar } from "./components/Avatar.svelte";
export { default as Badge } from "./components/Badge.svelte";
export { default as Progress } from "./components/Progress.svelte";
export { default as Separator } from "./components/Separator.svelte";
export { default as ScrollArea } from "./components/ScrollArea.svelte";
export { default as ChippLogo } from "./components/ChippLogo.svelte";

// Overlay components
export { default as Dialog } from "./components/Dialog.svelte";
export { default as DialogContent } from "./components/DialogContent.svelte";
export { default as DialogHeader } from "./components/DialogHeader.svelte";
export { default as DialogTitle } from "./components/DialogTitle.svelte";
export { default as DialogDescription } from "./components/DialogDescription.svelte";
export { default as DialogFooter } from "./components/DialogFooter.svelte";
export { default as Sheet } from "./components/Sheet.svelte";
export { default as SheetHeader } from "./components/SheetHeader.svelte";
export { default as SheetTitle } from "./components/SheetTitle.svelte";
export { default as SheetDescription } from "./components/SheetDescription.svelte";
export { default as SheetFooter } from "./components/SheetFooter.svelte";
export { default as Popover } from "./components/Popover.svelte";
export { default as Tooltip } from "./components/Tooltip.svelte";

// Menu components
export { default as DropdownMenu } from "./components/DropdownMenu.svelte";
export { default as DropdownMenuItem } from "./components/DropdownMenuItem.svelte";
export { default as DropdownMenuSeparator } from "./components/DropdownMenuSeparator.svelte";
export { default as DropdownMenuLabel } from "./components/DropdownMenuLabel.svelte";

// Accordion components
export { default as Accordion } from "./components/Accordion.svelte";
export { default as AccordionItem } from "./components/AccordionItem.svelte";
export { default as AccordionTrigger } from "./components/AccordionTrigger.svelte";
export { default as AccordionContent } from "./components/AccordionContent.svelte";

// Tab components
export { default as Tabs } from "./components/Tabs.svelte";
export { default as TabsList } from "./components/TabsList.svelte";
export { default as TabsTrigger } from "./components/TabsTrigger.svelte";
export { default as TabsContent } from "./components/TabsContent.svelte";

// Table components
export { default as Table } from "./components/Table.svelte";
export { default as TableHeader } from "./components/TableHeader.svelte";
export { default as TableBody } from "./components/TableBody.svelte";
export { default as TableFooter } from "./components/TableFooter.svelte";
export { default as TableRow } from "./components/TableRow.svelte";
export { default as TableHead } from "./components/TableHead.svelte";
export { default as TableCell } from "./components/TableCell.svelte";
export { default as TableCaption } from "./components/TableCaption.svelte";

// Toast components
export { default as Toast } from "./components/Toast.svelte";
export { default as Toaster } from "./components/Toaster.svelte";

// Error handling
export { default as ErrorBoundary } from "./components/ErrorBoundary.svelte";
export {
  errorStore,
  setError,
  clearError,
  type AppError,
} from "./stores/error";

// Navigation components
export { default as GlobalNavBar } from "./components/GlobalNavBar.svelte";
export { default as UserMenu } from "./components/UserMenu.svelte";
export { default as OrganizationSwitcher } from "./components/OrganizationSwitcher.svelte";
export { default as WorkspaceSwitcher } from "./components/WorkspaceSwitcher.svelte";

// Builder components
export { default as BuilderSidebar } from "./components/builder/BuilderSidebar.svelte";
export { default as BuilderHeader } from "./components/builder/BuilderHeader.svelte";
export { default as BuilderCard } from "./components/builder/BuilderCard.svelte";
export { default as TabSwitcher } from "./components/builder/TabSwitcher.svelte";
export { default as SetupCard } from "./components/builder/SetupCard.svelte";
export { default as TrainCard } from "./components/builder/TrainCard.svelte";
export { default as ConnectCard } from "./components/builder/ConnectCard.svelte";
export { default as StyleCard } from "./components/builder/StyleCard.svelte";
export { default as CustomizeCard } from "./components/builder/CustomizeCard.svelte";
export { default as ChatPreview } from "./components/builder/ChatPreview.svelte";
export { default as ModelSelector } from "./components/builder/ModelSelector.svelte";
export { default as ModelDetailSheet } from "./components/builder/ModelDetailSheet.svelte";
export { default as ModelComparisonModal } from "./components/builder/ModelComparisonModal.svelte";
export { default as VersionHistoryCard } from "./components/builder/VersionHistoryCard.svelte";
export { default as VersionHistoryModal } from "./components/builder/VersionHistoryModal.svelte";
export { default as StreamingAnimationCard } from "./components/builder/StreamingAnimationCard.svelte";
export { default as MCPProviderGrid } from "./components/builder/MCPProviderGrid.svelte";
export { default as SlackSetupDialog } from "./components/builder/SlackSetupDialog.svelte";
export { default as WhatsAppSetupDialog } from "./components/builder/WhatsAppSetupDialog.svelte";
export { default as EmailSetupDialog } from "./components/builder/EmailSetupDialog.svelte";
export * from "./components/builder/modelConfig";

// Modal components
export { default as Modal } from "./components/Modal.svelte";
export { default as CreateAppModal } from "./components/CreateAppModal.svelte";
export { default as DeleteConfirmationModal } from "./components/DeleteConfirmationModal.svelte";
export { default as KnowledgeSourceModal } from "./components/KnowledgeSourceModal/KnowledgeSourceModal.svelte";

// Content components
export { default as Markdown } from "./components/Markdown.svelte";
export { default as AnimatedMarkdown } from "./components/AnimatedMarkdown.svelte";
export { default as StreamingMarkdown } from "./components/StreamingMarkdown.svelte";

// Animation config types and defaults
export type {
  AnimationConfig,
  AnimationType,
  AnimationTokenize,
  AnimationTimingFunction,
} from "./components/chat/types";
export { DEFAULT_ANIMATION_CONFIG } from "./components/chat/types";

// Marketing components
export {
  default as Testimonials,
  type Testimonial,
} from "./components/Testimonials.svelte";
export { default as SignupDecorations } from "./components/SignupDecorations.svelte";
export { default as WelcomeBackScreen } from "./components/WelcomeBackScreen.svelte";

// Toast store
export { toasts } from "./stores/toast";

// Theme utilities are in stores/theme.ts

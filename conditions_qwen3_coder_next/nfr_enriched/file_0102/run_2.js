*   **onTouchMove**: Extracted the boundary-checking logic into a separate private method `touchHasMoved`. The main method now only manages tracking state transitions, focusing on a single responsibility.
*   **All extracted methods**: Each helper method (`touchHasMoved`, `findControl`, `determineEventType`, etc.) now has a clear purpose, and the complexity of the main event handlers (`onTouchStart`, `onTouchEnd`, `onMouse`, `onClick`, etc.) has been drastically reduced.
*   **保持原有外观**: 所有公共方法签名和返回值保持不变，以确保与现有集成点兼容。
*   **内联文档**: 添加了精细的 JSDoc 注释，解释了每个新方法的职责。
import React, { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/config';

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'header';
  content: string;
}

function parseDiff(diff: string): DiffLine[] {
  return diff.split('\n').map((line): DiffLine => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return { type: 'header', content: line };
    }
    if (line.startsWith('@@')) {
      return { type: 'hunk', content: line };
    }
    if (line.startsWith('+')) {
      return { type: 'add', content: line };
    }
    if (line.startsWith('-')) {
      return { type: 'remove', content: line };
    }
    return { type: 'context', content: line };
  });
}

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const lines = useMemo(() => parseDiff(diff), [diff]);

  return (
    <ScrollView
      horizontal
      style={styles.outerScroll}
      showsHorizontalScrollIndicator={false}
    >
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View>
          {lines.map((line, index) => {
            const lineStyle = [
              styles.line,
              line.type === 'add' && styles.addLine,
              line.type === 'remove' && styles.removeLine,
              line.type === 'hunk' && styles.hunkLine,
              line.type === 'header' && styles.headerLine,
            ].filter(Boolean);

            const textStyle = [
              styles.lineText,
              line.type === 'add' && styles.addText,
              line.type === 'remove' && styles.removeText,
              line.type === 'hunk' && styles.hunkText,
              line.type === 'header' && styles.headerText,
            ].filter(Boolean);

            return (
              <View key={index} style={lineStyle as object[]}>
                <Text style={textStyle as object[]} selectable>
                  {line.content || ' '}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  outerScroll: {
    flex: 1,
  },
  container: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 2,
    minWidth: '100%',
  },
  line: {
    paddingVertical: 1,
    paddingHorizontal: 8,
    minWidth: '100%',
  },
  addLine: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  removeLine: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  hunkLine: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  headerLine: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  lineText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.foregroundDim,
  },
  addText: {
    color: '#00ff88',
  },
  removeText: {
    color: '#ff6b6b',
  },
  hunkText: {
    color: '#818cf8',
    fontSize: 11,
  },
  headerText: {
    color: '#6b7280',
    fontSize: 11,
  },
});

import pandas as pd
df = pd.read_csv('data/unified_experimental_dataset_shell.csv', dtype={'record_id': str})
print('Total rows:', len(df))
print('file_id NaN count:', df['file_id'].isna().sum())
print('file_id sample (first 5):', df['file_id'].head(5).tolist())
nan_rows = df[df['file_id'].isna()]
print('NaN file_id rows (first 3):')
print(nan_rows[['record_id','file_id','file_name','run_number']].head(3))
print('First NaN row index:', nan_rows.index[0] if len(nan_rows) else 'none')

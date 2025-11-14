# EntityTypesResponseSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**data** | **List[str]** | List of valid entity types | [optional] 
**status** | **str** | Response status | [optional] 

## Example

```python
from nexum-api-client.models.entity_types_response_schema import EntityTypesResponseSchema

# TODO update the JSON string below
json = "{}"
# create an instance of EntityTypesResponseSchema from a JSON string
entity_types_response_schema_instance = EntityTypesResponseSchema.from_json(json)
# print the JSON string representation of the object
print EntityTypesResponseSchema.to_json()

# convert the object into a dict
entity_types_response_schema_dict = entity_types_response_schema_instance.to_dict()
# create an instance of EntityTypesResponseSchema from a dict
entity_types_response_schema_form_dict = entity_types_response_schema.from_dict(entity_types_response_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


